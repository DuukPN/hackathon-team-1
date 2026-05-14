from awscrt import mqtt
from awsiot import mqtt_connection_builder
from config import (
    ENDPOINT, CERT_PATH, KEY_PATH, ROOT_CA_PATH,
    DEVICE_ID
)

import adafruit_bno055
import board
import time
import json
import serial
import pynmea2


def main():
    mqtt_connection = mqtt_connection_builder.mtls_from_path(
        endpoint=ENDPOINT,
        cert_filepath=CERT_PATH,
        pri_key_filepath=KEY_PATH,
        ca_filepath=ROOT_CA_PATH,
        client_id=DEVICE_ID,
        clean_session=False,
        keep_alive_secs=30,
    )

    print(f"Connecting to {ENDPOINT}...")
    connect_future = mqtt_connection.connect()
    connect_future.result()
    print("Connected!")

    # Connect to 9-DoF IMU sensor (BNO055)
    i2c = board.I2C()
    imu_sensor = adafruit_bno055.BNO055_I2C(i2c)

    # Connect to GPS sensor
    port = "/dev/ttyACM0"
    baud = 9600

    # TODO: configure sensor settings: acc/gyro frequency, etc.

    gps_sensor = serial.Serial(port, baud)

    try:
        while True:
            gps_data = pynmea2.parse(gps_sensor.readline())
            print(gps_data)

            status = imu_sensor.calibration_status

            if not all(s == 3 for s in status):
                print(("Status degraded!!!\n"
                       "  System: %d\n"
                       "  Gyro:   %d\n"
                       "  Accel:  %d\n"
                       "  Mag:    %d") % status)

            status_sys, status_gyro, status_acc, status_mag = status

            acc_x, acc_y, acc_z = imu_sensor.acceleration
            gyro_x, gyro_y, gyro_z = imu_sensor.gyro
            mag_x, mag_y, mag_z = imu_sensor.magnetic

            temp = imu_sensor.temperature

            grav_x, grav_y, grav_z = imu_sensor.gravity
            lin_acc_x, lin_acc_y, lin_acc_z = imu_sensor.linear_acceleration
            abs_orient_x, abs_orient_y, abs_orient_z, abs_orient_w = imu_sensor.quaternion

            mqtt_connection.publish(
                topic=f"tracking-box/data",
                payload=json.dumps({
                    "status_sys": status_sys,
                    "status_gyro": status_gyro,
                    "status_acc": status_acc,
                    "status_mag": status_mag,
                    "acc_x": acc_x,
                    "acc_y": acc_y,
                    "acc_z": acc_z,
                    "gyro_x": gyro_x,
                    "gyro_y": gyro_y,
                    "gyro_z": gyro_z,
                    "mag_x": mag_x,
                    "mag_y": mag_y,
                    "mag_z": mag_z,
                    "temperature": temp,
                    "gravity_x": grav_x,
                    "gravity_y": grav_y,
                    "gravity_z": grav_z,
                    "linear_acc_x": lin_acc_x,
                    "linear_acc_y": lin_acc_y,
                    "linear_acc_z": lin_acc_z,
                    "abs_orientation_x": abs_orient_x,
                    "abs_orientation_y": abs_orient_y,
                    "abs_orientation_z": abs_orient_z,
                    "abs_orientation_w": abs_orient_w,
                }),
                qos=mqtt.QoS.AT_LEAST_ONCE
            )

    except KeyboardInterrupt:
        print("Disconnecting...")
        mqtt_connection.disconnect().result()
        gps_sensor.close()


if __name__ == "__main__":
    main()
