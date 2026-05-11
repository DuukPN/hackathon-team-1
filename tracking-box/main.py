from awscrt import mqtt
from awsiot import mqtt_connection_builder
from config import (
    ENDPOINT, CERT_PATH, KEY_PATH, ROOT_CA_PATH,
    DEVICE_ID
)


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

    try:
        while True:
            pass
    except KeyboardInterrupt:
        print("Disconnecting...")
        mqtt_connection.disconnect().result()


if __name__ == "__main__":
    main()
