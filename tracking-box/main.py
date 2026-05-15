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
import datetime
import threading
from scipy.spatial.transform import Rotation
import numpy as np


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
            line = self.gps_sensor.readline().decode("ascii", errors="replace").strip()

            if not line.startswith("$"):
                continue
            if "*" in line: # checksum
                try:
                    data, cs = line[1:].split("*")
                    result = 0
                    for char in data:
                        result ^= ord(char)
                    if not f"{result:02X}" == cs.strip().upper():
                        continue
                except:
                    print("checksum fail!!")
                    continue

            fields = line[1:].split("*")[0].split(",")

            sentence_type = fields[0][2:]

            # print(sentence_type, fields)

            if sentence_type == "RMC":
                if fields[3] and fields[4]:
                    degrees = int(float(fields[3]) / 100)
                    minutes = float(fields[3]) - degrees * 100
                    decimal = degrees + minutes / 60
                    if fields[4] == "S":
                        decimal *= -1
                    self.lat = decimal
                else:
                    self.lat = 0

                if fields[5] and fields[6]:
                    degrees = int(float(fields[5]) / 100)
                    minutes = float(fields[5]) - degrees * 100
                    decimal = degrees + minutes / 60
                    if fields[6] == "W":
                        decimal *= -1
                    self.long = decimal
                else:
                    self.long = 0

                self.speed = (float(fields[7]) if fields[7] else 0) * 1.852
                self.course = (float(fields[8]) if fields[8] else 0)

                if fields[1]:
                    hh = int(fields[1][0:2])
                    mm = int(fields[1][2:4])
                    ss = int(fields[1][4:6])
                    ms = int(fields[1][7:9]) * 10 * 1000 if "." in fields[1] else 0  # centiseconds -> microseconds
                    time = datetime.time(hh, mm, ss, ms)

                    if fields[9]:
                        dd = int(fields[9][0:2])
                        mm = int(fields[9][2:4])
                        yy = int(fields[9][4:6]) + 2000
                        date = datetime.date(yy, mm, dd)
                    else:
                        date = datetime.date.fromtimestamp(self.time / 1000)

                    self.time = datetime.datetime.combine(date, time).replace(
                        tzinfo=datetime.timezone.utc).timestamp() * 1000

            elif sentence_type == "GGA":
                if fields[2] and fields[2]:
                    degrees = int(float(fields[2]) / 100)
                    minutes = float(fields[2]) - degrees * 100
                    decimal = degrees + minutes / 60
                    if fields[3] == "S":
                        decimal *= -1
                    self.lat = decimal
                else:
                    self.lat = 0

                if fields[4] and fields[4]:
                    degrees = int(float(fields[4]) / 100)
                    minutes = float(fields[4]) - degrees * 100
                    decimal = degrees + minutes / 60
                    if fields[5] == "W":
                        decimal *= -1
                    self.long = decimal
                else:
                    self.long = 0

                self.alt = (float(fields[9]) if fields[9] else 0)
                self.satellites = (int(fields[7]) if fields[7] else 0)

                if fields[1]:
                    hh = int(fields[1][0:2])
                    mm = int(fields[1][2:4])
                    ss = int(fields[1][4:6])
                    ms = int(fields[1][7:9]) * 10 * 1000 if "." in fields[1] else 0  # centiseconds -> microseconds
                    time = datetime.time(hh, mm, ss, ms)
                    date = datetime.date.fromtimestamp(self.time / 1000)
                    self.time = datetime.datetime.combine(date, time).replace(
                        tzinfo=datetime.timezone.utc).timestamp() * 1000


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

    # Remap x=x, y=z, z=-y
    imu_sensor.axis_remap = (0, 2, 1, 0, 1, 0)
    imu_sensor.accel_range = adafruit_bno055.ACCEL_8G

    try:
        while True:
            print(
                f"Lat: {gps.lat:.6f}°  "
                f"Lon: {gps.long:.6f}°  "
                f"Alt: {gps.alt:.1f}m  "
                f"Speed: {gps.speed:.1f}km/h  "
                f"Course: {gps.course:.1f}°  "
                f"Sats: {gps.satellites}  "
                f"Time: {gps.time}  "
            )

            status = imu_sensor.calibration_status

            if not all(x == 3 for x in status):
                print(status)

            status_sys, status_gyro, status_acc, status_mag = status

            acc_x, acc_y, acc_z = imu_sensor.acceleration
            gyro_x, gyro_y, gyro_z = imu_sensor.gyro
            mag_x, mag_y, mag_z = imu_sensor.magnetic

            temp = imu_sensor.temperature

            grav_x, grav_y, grav_z = imu_sensor.gravity
            lin_acc_x, lin_acc_y, lin_acc_z = imu_sensor.linear_acceleration
            quat = imu_sensor.quaternion
            qx, qy, qz, qw = quat
            abs_orient_x, abs_orient_y, abs_orient_z, abs_orient_w = quat
            print(Rotation.from_quat(quat).as_euler("zyx", degrees=True))
            print(f"(sensor value: {imu_sensor.euler})")
            yaw = np.atan2(2 * qy * qw - 2 * qx * qz, 1 - 2 * qy * qy - 2 * qz * qz)
            pitch = np.asin(2 * qx * qy + 2 * qz * qw)
            roll = np.atan2(2 * qx * qw - 2 * qy * qz, 1 - 2 * qx * qx - 2 * qz * qz)
            print(np.rad2deg((yaw, pitch, roll)))

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
                }),
                qos=mqtt.QoS.AT_LEAST_ONCE
            )

            time.sleep(1)

    except KeyboardInterrupt:
        print("Disconnecting...")
        mqtt_connection.disconnect().result()


if __name__ == "__main__":
    main()
