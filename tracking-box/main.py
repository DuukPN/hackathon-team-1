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

    # TODO: Read sensor data, build payloads, and publish to IoT Core

    i2c = board.I2C()
    sensor = adafruit_bno055.BNO055_I2C(i2c)

    try:
        while True:
            print(sensor.euler)
            print(sensor.gravity)
            mqtt_connection.publish(
                topic=f"tracking-box/data",
                payload=json.dumps({
                    "euler": sensor.euler,
                    "gravity": sensor.gravity
                }),
                qos=mqtt.QoS.AT_LEAST_ONCE
            )
            time.sleep(1)

    except KeyboardInterrupt:
        print("Disconnecting...")
        mqtt_connection.disconnect().result()


if __name__ == "__main__":
    main()
