import { UUID } from 'crypto';
import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { Socket } from 'net';
import { HeatingThermostat } from './accessory';

export class ClimateControllerPlatform implements DynamicPlatformPlugin {
  private readonly host: string;
  private readonly port: number;
  private readonly platformAccessories: Map<string, PlatformAccessory> = new Map();
  private readonly climateAccessories: Array<HeatingThermostat> = new Array();

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API
  ) {
    this.host = this.config.controllerHost || '127.0.0.1';
    this.port = this.config.controllerPort || 2137;
    this.api.on('didFinishLaunching', async () => {
      const configuration = await this.getConfiguration();
      this.log.info('Received room configuration:', configuration);
      configuration.rooms.forEach((room: { name: string, serial: UUID, features: string, port: number }) => {
        const uuid = this.api.hap.uuid.generate(room.name);
        let accessory = this.platformAccessories.get(uuid);
        if (!accessory) {
          this.log.info(`Registering new accessory in: ${room.name}`);
          accessory = new this.api.platformAccessory(`${room.name} ${HeatingThermostat.Model}`, uuid);
          this.api.registerPlatformAccessories('homebridge-climate-controller-plugin', 'ClimateControllerPlatform', [accessory]);
        }
        this.platformAccessories.set(uuid, accessory);
        const accessoryConfig = {
          host: this.host,
          port: room.port,
          name: room.name,
          firmware: configuration.version,
          serial: room.serial
        };
        this.climateAccessories.push(new HeatingThermostat(this.log, this.api, accessory, accessoryConfig));
      });
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info(`Loading cached accessory: ${accessory.displayName}`);
    this.platformAccessories.set(accessory.UUID, accessory);
  }

  async getConfiguration(): Promise<any> {
    this.log.debug('Getting room configuration');
    return new Promise((resolve, reject) => {
      const client = new Socket();

      client.connect(this.port, this.host);

      client.on('data', data => {
        try {
          const configuration = JSON.parse(data.toString());
          resolve(configuration);
        } catch {
          reject(new this.api.hap.HapStatusError(this.api.hap.HAPStatus.INVALID_VALUE_IN_REQUEST));
        }
        client.end();
      })
    });
  }
}