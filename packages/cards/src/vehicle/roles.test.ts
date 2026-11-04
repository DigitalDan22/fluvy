import { describe, expect, it } from 'vitest';
import { BMW, carHouse, KIA, MG, RENAULT, TESLA, VOLVO, VW } from './fixtures.js';
import { vehicleDevice, vehicleDevices, vehicleEntities, wheelOf } from './roles.js';

const hass = carHouse();
const found = (device: string) => vehicleEntities(hass, device);

describe('a car’s entities', () => {
  it('finds a Tesla’s by its keys: one key a sensor, a switch and a binary sensor; the rated range over the estimate', () => {
    const { roles } = found(TESLA.device);
    expect(roles).toMatchObject({
      battery: 'sensor.model_y_battery_level',
      range: 'sensor.model_y_battery_range',
      charging: 'sensor.model_y_charging',
      charge_switch: 'switch.model_y_charge',
      plugged: 'binary_sensor.model_y_charge_cable',
      charge_power: 'sensor.model_y_charger_power',
      charge_rate: 'sensor.model_y_charge_rate',
      time_to_full: 'sensor.model_y_time_to_full_charge',
      charge_limit: 'number.model_y_charge_limit',
      charge_port: 'cover.model_y_charge_port_door',
      climate: 'climate.model_y_climate',
      inside: 'sensor.model_y_inside_temperature',
      outside: 'sensor.model_y_outside_temperature',
      lock: 'lock.model_y_lock',
      trunk: 'cover.model_y_trunk',
      frunk: 'cover.model_y_frunk',
      windows: 'cover.model_y_windows',
      sentry: 'switch.model_y_sentry_mode',
      odometer: 'sensor.model_y_odometer',
      tyre_fl: 'sensor.model_y_tire_pressure_front_left',
      tyre_rr: 'sensor.model_y_tire_pressure_rear_right',
      location: 'device_tracker.model_y_location',
      software: 'update.model_y_update',
      state: 'binary_sensor.model_y_status',
      shift: 'sensor.model_y_shift_state',
    });
  });

  it('never takes a charge cable’s latch for the lock, the route for the place, an overheat guard for the climate', () => {
    const { roles } = found(TESLA.device);
    const ids = Object.values(roles);
    expect(ids).not.toContain('lock.model_y_charge_cable_lock');
    expect(ids).not.toContain('device_tracker.model_y_route');
    expect(ids).not.toContain('climate.model_y_cabin_overheat_protection');
  });

  it('never makes a control of what sounds, wakes or opens a garage', () => {
    const all = (device: string) => {
      const { roles, doors, windows, warnings } = found(device);
      return [...Object.values(roles), ...doors, ...windows, ...Object.values(warnings)];
    };
    expect(all(TESLA.device)).not.toContain('button.model_y_honk_horn');
    expect(all(TESLA.device)).not.toContain('button.model_y_wake');
    expect(all(TESLA.device)).not.toContain('button.model_y_homelink');
    expect(all(KIA.device)).not.toContain('button.ev6_force_update');
    expect(all(KIA.device)).not.toContain('button.ev6_open_all_windows');
    expect(all(RENAULT.device)).not.toContain('button.zoe_sound_horn');
    expect(all(VOLVO.device)).not.toContain('button.ex30_honk_flash');
    expect(all(VOLVO.device)).not.toContain('button.ex30_engine_start');
    expect(all(MG.device)).not.toContain('button.mg_mg4_trigger_alarm');
    expect(all(MG.device)).not.toContain('button.mg_mg4_open_boot');
    expect(all(VW.device)).not.toContain('switch.id_4_force_data_refresh');
  });

  it('gathers a Tesla’s doors and its tyres’ warnings by their wheel', () => {
    const { doors, warnings } = found(TESLA.device);
    expect(doors).toEqual(['binary_sensor.model_y_front_driver_door']);
    expect(warnings).toEqual({ rr: 'binary_sensor.model_y_tire_pressure_warning_rear_right' });
  });

  it('reads a Kia’s own battery, never its 12 V one; its lock over the sensor that says it; its AC limit', () => {
    const { roles, doors, windows, warnings } = found(KIA.device);
    expect(roles).toMatchObject({
      battery: 'sensor.ev6_ev_battery_level',
      range: 'sensor.ev6_ev_range',
      charging: 'binary_sensor.ev6_ev_battery_charge',
      plugged: 'binary_sensor.ev6_ev_battery_plug',
      charge_limit: 'number.ev6_ac_charging_limit',
      charge_switch: 'switch.ev6_ev_charging',
      climate: 'climate.ev6_climate',
      lock: 'lock.ev6_door_lock',
      trunk: 'binary_sensor.ev6_trunk',
      frunk: 'binary_sensor.ev6_hood',
      odometer: 'sensor.ev6_odometer',
      address: 'sensor.ev6_geocoded_location',
      updated: 'sensor.ev6_last_updated_at',
    });
    expect(Object.values(roles)).not.toContain('sensor.ev6_car_battery_level');
    expect(Object.values(roles)).not.toContain('sensor.ev6_set_temperature');
    expect(doors).toEqual(['binary_sensor.ev6_front_left_door']);
    expect(windows).toEqual(['binary_sensor.ev6_front_left_window']);
    expect(warnings).toEqual({ all: 'binary_sensor.ev6_tire_all' });
  });

  it('reads Renault’s battery, cable, charge and lock by what they are, its charge and climate by their buttons', () => {
    expect(found(RENAULT.device).roles).toMatchObject({
      battery: 'sensor.zoe_battery',
      range: 'sensor.zoe_battery_autonomy',
      charging: 'sensor.zoe_charge_state',
      plugged: 'binary_sensor.zoe_plugged_in',
      charge_start: 'button.zoe_start_charge',
      charge_stop: 'button.zoe_stop_charge',
      climate_start: 'button.zoe_start_air_conditioner',
      climate_running: 'binary_sensor.zoe_hvac',
      lock: 'binary_sensor.zoe_lock',
      trunk: 'binary_sensor.zoe_hatch',
      odometer: 'sensor.zoe_mileage',
    });
  });

  it('reads Volvo’s climate buttons, a tyre’s warning by its wheel, its state', () => {
    const { roles, warnings } = found(VOLVO.device);
    expect(roles).toMatchObject({
      battery: 'sensor.ex30_battery',
      plugged: 'sensor.ex30_charger_connection_status',
      climate_start: 'button.ex30_climatization_start',
      climate_stop: 'button.ex30_climatization_stop',
      lock: 'lock.ex30_lock',
      trunk: 'binary_sensor.ex30_tailgate',
      state: 'sensor.ex30_availability',
    });
    expect(warnings).toEqual({ fr: 'binary_sensor.ex30_tire_front_right' });
  });

  it('reads MG’s, Volkswagen’s and BMW’s by the ends of their ids, without the device’s name', () => {
    const mg = found(MG.device).roles;
    expect(mg).toMatchObject({
      battery: 'sensor.mg_mg4_state_of_charge',
      range: 'sensor.mg_mg4_electric_range',
      charging: 'sensor.mg_mg4_charging_status',
      lock: 'lock.mg_mg4_lock',
      trunk: 'binary_sensor.mg_mg4_boot_status',
      state: 'sensor.mg_mg4_vehicle_reachability',
    });
    // its fuel level wears the battery's class: never the car's charge
    expect(Object.values(mg)).not.toContain('sensor.mg_mg4_fuel_level');
    const vw = found(VW.device).roles;
    expect(vw.lock).toBe('lock.id_4_door_locked');
    expect(Object.values(vw)).not.toContain('lock.id_4_trunk_locked');
    expect(found(BMW.device).roles).toMatchObject({
      battery: 'sensor.i4_battery_ev_state_of_charge',
      range: 'sensor.i4_range_ev_remaining_range',
      lock: 'sensor.i4_doors_lock',
      location: 'device_tracker.i4_location',
    });
  });

  it('takes a role named by hand over the one it finds; with scan off, only those', () => {
    expect(
      vehicleEntities(hass, TESLA.device, [
        { role: 'range', entity: 'sensor.model_y_estimate_battery_range' },
      ]).roles.range,
    ).toBe('sensor.model_y_estimate_battery_range');
    const named = vehicleEntities(
      hass,
      TESLA.device,
      [{ role: 'battery', entity: 'sensor.model_y_battery_level' }],
      undefined,
      false,
    );
    expect(named.roles).toEqual({ battery: 'sensor.model_y_battery_level' });
    expect(named.doors).toEqual([]);
    expect(
      vehicleEntities(hass, TESLA.device, [{ role: 'nonsense', entity: 'sensor.x' }]).roles,
    ).not.toHaveProperty('nonsense');
  });

  it('reads the device off any of its entities; lists the house’s cars, never a washer', () => {
    expect(vehicleDevice(hass, undefined, 'lock.model_y_lock')).toBe(TESLA.device);
    expect(vehicleDevices(hass)).toEqual([
      TESLA.device,
      KIA.device,
      RENAULT.device,
      VOLVO.device,
      MG.device,
      VW.device,
      BMW.device,
    ]);
  });

  it('knows a wheel by its key or its id', () => {
    expect(wheelOf('vehicle_state_tpms_soft_warning_fl')).toBe('fl');
    expect(wheelOf('tire_pressure_rear_left_warning_is_on')).toBe('rl');
    expect(wheelOf('tire_front_right')).toBe('fr');
    expect(wheelOf('back_right_tyre')).toBe('rr');
    expect(wheelOf('wheel_tyre_monitor_status')).toBe('all');
  });
});
