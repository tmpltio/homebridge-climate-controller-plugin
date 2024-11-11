import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';

export class ClimateControllerPlatform implements DynamicPlatformPlugin {
  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API
  ) {
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info(`Loading cached accessory: ${accessory.displayName}`);
  }
}