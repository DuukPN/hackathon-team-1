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
import threading


class GPSSensor:
    def __init__(self, port, baud, timeout=None):
        self.gps_sensor = serial.Serial(port, baud)

        self.lat = 42
        self.long = 42
        self.alt = 42
        self.speed = 42
        self.course = 42
        self.satellites = 42
        self.time = 42

        self.thread = threading.Thread(target=self.update_data)
        self.thread.start()

    def update_data(self):
        while True:
            gps_line = self.gps_sensor.readline().decode("ascii", errors="replace").strip()
            data = pynmea2.parse(gps_line)

            print(data)

            if data.sentence_type == "RMC":
                self.lat = data.latitude
                self.long = data.longitude
                self.speed = (data.spd_over_grnd if data.spd_over_grnd else 0) * 1.852
                self.course = (data.true_course if data.true_course else 0)
                try:
                    self.time = data.datetime.timestamp() * 1000
                except:
                    pass

            elif data.sentence_type == "GGA":
                self.lat = data.latitude
                self.long = data.longitude
                self.alt = (data.altitude if data.altitude else 0)
                self.satellites = int(data.num_sats)
                try:
                    self.time = data.datetime.timestamp() * 1000
                except:
                    pass


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
    gps = GPSSensor(port, baud)

    # TODO: configure sensor settings: acc/gyro frequency, etc.

    try:
        while True:
            print(
                f"Lat: {gps.lat:.6f}°  "
                f"Lon: {gps.long:.6f}°  "
                f"Alt: {gps.alt:.1f}m  "
                f"Speed: {gps.speed:.1f}kts  "
                f"Course: {gps.course:.1f}°  "
                f"Sats: {gps.satellites}  "
                f"Time: {gps.time}  "
            )

            status = imu_sensor.calibration_status

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
                    "timestamp": int(time.time() * 1000),
                    "team_id": 1,
                    "session_id": 1,
                    "latitude": gps.lat,
                    "longitude": gps.long,
                    "altitude": gps.alt,
                    "speed": gps.speed,
                    "course": gps.course,
                    "satellites": gps.satellites,
                    "gps_timestamp": gps.time,
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

                    "pitch_rate": 0,
                    "roll_rate": 0,
                    "yaw_rate": 0,
                    "pitch_angle": 0,
                    "roll_angle": 0,
                    "yaw_angle": 0,
                }),
                qos=mqtt.QoS.AT_LEAST_ONCE
            )

            time.sleep(1)

    except KeyboardInterrupt:
        print("Disconnecting...")
        mqtt_connection.disconnect().result()


if __name__ == "__main__":
    main()
