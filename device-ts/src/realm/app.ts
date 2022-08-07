import { Component, Device, Sensor } from './schemas';
import { appID, realmUser } from './config';
import Realm from 'realm';
import { ObjectID } from "bson";

/**
 * Initialize a new Realm application instance
 */
const app = new Realm.App({ id: appID });
let realm: Realm;

/**
 * Return the names of created devices as list
 * @returns List of createded devices names
 */
export function getDevices(): string[] {
  const deviceList: any[] = [];
  realm.objects<Device>('Device').map((device) => {
    deviceList.push({ _id: device._id, name: device.name });
  })
  return deviceList;
}

/**
 * Creates a new Device object with the provided name
 * @param name Name of the device
 * @returns Attributes of the created device as JSON object
 */
export function createDevice(name: string) {
  const device: any = realm.write(() => {
    const dev = realm.create<Device>('Device', {
      _id: new ObjectID,
      name: name,
      device_id: app.currentUser?.id ?? "no current user",
      isOn: false,
      mixedTypes: ""
    });
    return dev;
  });
  if (device instanceof Device) {
    return { result: { name: device.name, _id: device._id } };
  } else {
    return { result: "Object creation failed!" }
  }
}

/**
 * Creates a new component with the provided name and relates it to the first previously created Device object
 * @param name Name of the component to be created
 * @returns Result of the component creation procedure as JSON object or the resulting error
 */
export function addComponent(name: string) {
  if (realm.objects<Device>('Device').length > 0) {
    const device = realm.objects<Device>('Device')[0];
    realm.write(() => {
      const component = new Component(realm, {_id: new ObjectID, name: name, device_id: app.currentUser?.id ?? "no current user" });
      device.components.push(component);
    });
    return { result: "Component created and related to id: " + device.name };
  } else {
    const err = { result: "Add component failed, no device available!" };
    return err;
  }
}

/**
 * Uses the asymmetric sync functionality to efficiently push a time series object to the backend
 * @param value String type e.g. a sensor value
 * @returns JSON object
 */
export function addSensor(sensor: { value_1: string, value_2: string}) {
  const measurement = {
    _id: new ObjectID,
    device_id: app.currentUser?.id ?? "no current user",
    value_1: parseInt(sensor.value_1),
    value_2: parseInt(sensor.value_2),
    timestamp: new Date()
  };
  realm.write(() => {
    realm.create<Sensor>('Sensor', measurement);
    realm.objects<Device>('Device')[0].sensor = parseInt(sensor.value_1);
  });
  return ({ result: `Sensor measurement ${sensor} inserted!` });
}

/**
 * Pauses synchronization of a previously opened Realm
 * @returns JSON object
 */
export function pauseRealm() {
  console.log('pause')
  realm.syncSession?.pause();
  return ({ result: 'Sync paused!' });
}

/**
 * Resumes synchronization of a previsouly paused Realm 
 * @returns JSON object
 */
export function resumeRealm() {
  console.log('Sync paused!');
  realm.syncSession?.resume();
  return ({ result: 'Sync resumed!' });
}

/**
 * Change a flexible sync subscription dynamically to change data sets to be synchronized
 */
export function toggleSyncSubscription() {
  // Idea: Slider or simple toggle to select all or a subset of objects to sync
  console.log('not implemented yet')
}

/**
 * Object change listener callback function to process change events
 * @param object Modified object
 * @param changes List of modified fields
 */
function deviceChangeListener(object: any, changes: any) {
  console.log(`Changed object: ${object.name}`);
  if (changes.deleted) {
    console.log(`Object ${object.name} has been deleted!`);
  }
  console.log(`${changes.changedProperties.length} properties have been changed:`);
  changes.changedProperties.forEach((prop: any) => {
    console.log(` ${prop}`);
  });
}

/**
 * Adds an object change listener to the first previously created Device object using the above functiona as callback
 * @returns JSON object
 */
export function addObjectChangeListener() {
  const device = realm.objects<Device>('Device')[0];
  device.addListener(deviceChangeListener);
  return { result: `Listener added to device: ${device.name}!` }
}

/**
 * Remove a previously added object change listener from the first Device object created
 * @returns JSON object
 */
export function removeObjectChangeListener() {
  const device = realm.objects<Device>('Device')[0];
  device.removeListener(deviceChangeListener);
  return { result: `Listener removed from device: ${device.name}!` }
}

/**
 * Add a devices collection change listener
 */
 export function addDevicesChangeListener(listener:any) {
  const devices = realm.objects('Device');
  devices.addListener(listener);
}

/**
 * Atlas application services email/password authentication
 */
async function login() {
  await app.logIn(Realm.Credentials.emailPassword(realmUser.username, realmUser.password));
  realm = await Realm.open({
    schema: [Device, Component, Sensor],
    sync: {
      user: app.currentUser!,
      flexible: true
    }
  });
}

/**
 * Remove all change listeners,delete created devices/components
 */
export function cleanupRealm() {
  try {
    // Remove all change listener
    realm.removeAllListeners();
    // Delete all device and component entries of the current subscription
    realm.write(() => {
      realm.deleteAll();
    });
    // Remove all flexible sync subscriptions
    realm.subscriptions.update((subscriptions) => {
      subscriptions.removeAll();
    })
    console.log("Realm cleaned up!")
  } catch (err) {
    console.error("Failed: ", err);
  }
}

/**
 * Main function
 */
async function run() {
  await login().catch(err => {
    console.error("Error: " + JSON.stringify(err));
  });
  // Create and add flexible xync subscription filters
  const deviceID = `device_id = ${JSON.stringify(app.currentUser!.id)}`
  realm.subscriptions.update(subscriptions => {
    subscriptions.add(realm.objects('Device').filtered(deviceID, { name: "device-filter" }));
    subscriptions.add(realm.objects('Component').filtered(deviceID, { name: "component-filter" }));
  });
}

/**
 * Execute main function
 */
run().catch((err) => {
  console.error("Failed: ", err);
});
