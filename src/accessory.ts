import { API, CharacteristicValue, Logger, PlatformAccessory } from "homebridge";
import { Socket } from 'net';

export interface AccessoryConfig {
  host: string,
  port: number,
  name: string,
  firmware: string,
  serial: string
}

export class HeatingThermostat {
  public static readonly Model: string = 'Thermostat';

  private readonly manufacturer: string = 'tmplt.io';

  constructor(
    public readonly log: Logger,
    public readonly api: API,
    public readonly accessory: PlatformAccessory,
    public readonly config: AccessoryConfig
  ) {
    this.registerHandlers();
    this.createListener();
  }

  createListener() {
    const client = new Socket();

    client.connect(this.config.port, this.config.host);

    client.on('data', data => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'NotifyStatus') {
          this.log.debug('Received status notification from {room}: {message}', this.config.name, message);
          const service = this.accessory.getService(this.api.hap.Service.Thermostat);
          const status = message.status;
          if (service) {
            service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature).updateValue(status.current_temperature);
            service.getCharacteristic(this.api.hap.Characteristic.TargetTemperature).updateValue(status.target_temperature);
            service.getCharacteristic(this.api.hap.Characteristic.CurrentHeatingCoolingState).updateValue(this.toCurrentState(status.current_state));
            service.getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState).updateValue(this.toTargetState(status.target_state));
            service.getCharacteristic(this.api.hap.Characteristic.CurrentRelativeHumidity).updateValue(status.current_humidity);
            this.log.debug(`Updated ${this.config.name} - current temperature: ${status.current_temperature}, target temperature: ${status.target_temperature}, current state: ${status.current_state}, target state: ${status.target_state}, current humidity: ${status.current_humidity}`);
          }
        }
      } catch (error) {
        this.log.error(`Failed to parse response from ${this.config.name}: ${error}`);
      }
    });

    client.on('error', error => {
      this.log.error(`${this.config.name} listener error: ${error.message}`);
      client.end();
    });

    client.on('close', () => {
      this.log.warn(`${this.config.name} listener connection closed`);
      setTimeout(() => this.createListener(), 5000);
      client.end();
    });
  }

  registerHandlers() {
    this.log.debug(`Registering ${this.config.name} handlers`);

    const informationService = this.accessory.getService(this.api.hap.Service.AccessoryInformation) || this.accessory.addService(this.api.hap.Service.AccessoryInformation, this.accessory.displayName);

    informationService
      .setCharacteristic(this.api.hap.Characteristic.FirmwareRevision, this.config.firmware);
    informationService
      .setCharacteristic(this.api.hap.Characteristic.Manufacturer, this.manufacturer);
    informationService
      .setCharacteristic(this.api.hap.Characteristic.Model, HeatingThermostat.Model);
    informationService
      .setCharacteristic(this.api.hap.Characteristic.Name, this.accessory.displayName);
    informationService
      .setCharacteristic(this.api.hap.Characteristic.SerialNumber, this.config.serial);

    const thermostatService = this.accessory.getService(this.api.hap.Service.Thermostat) || this.accessory.addService(this.api.hap.Service.Thermostat, this.accessory.displayName);

    thermostatService
      .getCharacteristic(this.api.hap.Characteristic.CurrentTemperature)
      .setProps({ minValue: 0, maxValue: 40, minStep: 0.1 })
      .onGet(this.onGetCurrentTemperature.bind(this));

    thermostatService
      .setCharacteristic(this.api.hap.Characteristic.TargetTemperature, 20.0);
    thermostatService
      .getCharacteristic(this.api.hap.Characteristic.TargetTemperature)
      .setProps({ minValue: 16, maxValue: 24, minStep: 0.1 })
      .onGet(this.onGetTargetTemperature.bind(this))
      .onSet(this.onSetTargetTemperature.bind(this));

    thermostatService
      .getCharacteristic(this.api.hap.Characteristic.CurrentHeatingCoolingState)
      .setProps({ validValues: [this.api.hap.Characteristic.CurrentHeatingCoolingState.OFF, this.api.hap.Characteristic.CurrentHeatingCoolingState.HEAT] })
      .onGet(this.onGetCurrentState.bind(this));

    thermostatService
      .setCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState, this.api.hap.Characteristic.TargetHeatingCoolingState.OFF);
    thermostatService
      .getCharacteristic(this.api.hap.Characteristic.TargetHeatingCoolingState)
      .setProps({ validValues: [this.api.hap.Characteristic.TargetHeatingCoolingState.OFF, this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT] })
      .onGet(this.onGetTargetState.bind(this))
      .onSet(this.onSetTargetState.bind(this));

    thermostatService
      .setCharacteristic(this.api.hap.Characteristic.TemperatureDisplayUnits, this.api.hap.Characteristic.TemperatureDisplayUnits.CELSIUS);

    thermostatService
      .getCharacteristic(this.api.hap.Characteristic.CurrentRelativeHumidity)
      .onGet(this.onGetCurrentHumidity.bind(this));
  }

  async onGetCurrentTemperature() {
    const status = await this.getStatus();
    this.log.debug(`Got ${this.config.name} current temperature value: ${status.current_temperature}`);
    return status.current_temperature;
  }

  async onGetTargetTemperature() {
    const status = await this.getStatus();
    this.log.debug(`Got ${this.config.name} target temperature value: ${status.target_temperature}`);
    return status.target_temperature;
  }

  async onSetTargetTemperature(temperature: CharacteristicValue) {
    this.log.debug(`Setting ${this.config.name} target temperature value: ${Number(temperature)}`);
    const target = {
      temperature: Number(temperature)
    };
    await this.setControl(target);
  }

  async onGetCurrentState() {
    const status = await this.getStatus();
    this.log.debug(`Got ${this.config.name} current state value: ${status.current_state}`);
    return this.toCurrentState(status.current_state);
  }

  async onGetTargetState() {
    const status = await this.getStatus();
    this.log.debug(`Got ${this.config.name} target state value: ${status.target_state}`);
    return this.toTargetState(status.target_state);
  }

  async onSetTargetState(state: CharacteristicValue) {
    this.log.debug(`Setting ${this.config.name} target state value: ${this.fromTargetState(state)}`);
    const target = {
      state: this.fromTargetState(state)
    };
    await this.setControl(target);
  }

  async onGetCurrentHumidity() {
    const status = await this.getStatus();
    this.log.debug(`Got ${this.config.name} current humidity value: ${status.current_humidity}`);
    return status.current_humidity;
  }

  async getStatus(): Promise<any> {
    this.log.debug(`Getting ${this.config.name} status`);
    return await this.sendRequest('GetStatus');
  }

  async setControl(control: any): Promise<void> {
    this.log.debug(`Setting ${this.config.name} control`);
    await this.sendRequest('SetControl', control);
  }

  async sendRequest(type: string, target?: any | null): Promise<any> {
    return new Promise((resolve, reject) => {
      const client = new Socket();

      client.connect(this.config.port, this.config.host, () => {
        const request = {
          type: type,
          target_temperature: target?.temperature,
          target_state: target?.state
        };
        this.log.debug('Sending request:', request);
        const message = JSON.stringify(request);
        client.write(message);
      });

      client.on('data', data => {
        try {
          const response = JSON.parse(data.toString());
          this.log.debug('Received response:', response);
          if (response.type === type) {
            resolve(response.status);
          } else {
            reject(new this.api.hap.HapStatusError(this.api.hap.HAPStatus.INVALID_VALUE_IN_REQUEST));
          }
        } catch {
          reject(new this.api.hap.HapStatusError(this.api.hap.HAPStatus.INVALID_VALUE_IN_REQUEST));
        }
        client.end();
      });

      client.on('error', () => {
        reject(new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE));
        client.end();
      });
    })
  }

  toCurrentState(state: string) {
    return state === 'Heat'
      ? this.api.hap.Characteristic.CurrentHeatingCoolingState.HEAT
      : this.api.hap.Characteristic.CurrentHeatingCoolingState.OFF;
  }

  toTargetState(state: string) {
    return state === 'Heat'
      ? this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT
      : this.api.hap.Characteristic.TargetHeatingCoolingState.OFF;
  }

  fromTargetState(state: CharacteristicValue) {
    return state === this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT
      ? 'Heat'
      : 'Off'
  }
}