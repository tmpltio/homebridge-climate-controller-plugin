import { API } from 'homebridge';
import { ClimateControllerPlatform } from './platform';

export = (api: API) => {
  api.registerPlatform('ClimateControllerPlatform', ClimateControllerPlatform);
};