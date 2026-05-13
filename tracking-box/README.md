# Tracking Box (Raspberry Pi)

Python script that connects to AWS IoT Core via MQTT. Your job is to read sensor data and publish it.

## Connecting to the Pi

```bash
ssh pi@hackathon-pi-1.local
# Password: synadia
```

## Setup

### 1. Create IoT Certificates

The Pi needs certificates to authenticate with AWS IoT Core. Create them in the [AWS Console](https://synadia.awsapps.com/start):

1. Go to **AWS Console → IoT Core → Security → Certificates**
2. Click **Add certificate → Create certificate**
3. Make sure to set it to **"Active"** during creation
4. Download these 3 files:
   - **Device certificate** (`xxx-certificate.pem.crt`)
   - **Private key** (`xxx-private.pem.key`)
   - **Amazon Root CA 1** (click the link on the page, or download from [here](https://www.amazontrust.com/repository/AmazonRootCA1.pem))
5. **Attach the policy**: On the certificate page, click **Actions → Attach policy**, select `tracking-box-policy`
6. **Attach to thing**: Click **Actions → Attach thing**, select `tracking-box`

### 2. Place Certificates

Rename and place the downloaded files in the `certs/` directory:

```
tracking-box/certs/
├── certificate.pem.crt
├── private.pem.key
└── AmazonRootCA1.pem
```

### 3. Get Your IoT Endpoint

Find your account's IoT endpoint in the [AWS Console](https://synadia.awsapps.com/start):

1. Go to **AWS Console → IoT Core → Domain Configurations** (top of the left sidebar)
2. Copy the **domain name of the `iot:Data-ATS` configuration** (looks like `xxxxxx-ats.iot.eu-west-1.amazonaws.com`)
3. Paste it into `config.py` as the `ENDPOINT` value

### 4. Install Dependencies (on the Pi)

```bash
cd /home/pi/tracking-box
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 5. Run

```bash
source .venv/bin/activate
python main.py
```

## Deploying from Your Laptop

Instead of SSHing and editing files on the Pi, you can edit locally and deploy:

```bash
# From the repo root:
pnpm run pi:deploy   # Syncs files to Pi, installs deps, starts the service
pnpm run pi:status   # Check if it's running
pnpm run pi:stop     # Stop the service
```

> **Windows:** These scripts require bash. Use Git Bash, WSL, or run the SSH/rsync commands from the scripts manually.

The deploy script installs a systemd service that auto-restarts the script. View logs on the Pi:

```bash
journalctl -u tracking-box -f
```

## GPS Module

The Pi has a u-blox 7 GPS module connected via USB (`/dev/ttyACM0`). It outputs NMEA sentences.

### Configure 10Hz Update Rate

The GPS defaults to 1Hz. To set it to 10Hz (persists across power cycles):

```bash
pnpm run pi:gps
```

See [gps/README.md](gps/README.md) for more details on the GPS module and NMEA data format.

## IMU Sensor

The Pi has a BNO055 9-axis IMU sensor connected via USB-to-I2C bridge. It provides accelerometer, gyroscope, and magnetometer data.

See [imu/README.md](imu/README.md) for hardware details, setup instructions (udev rules, environment variables), and how to read sensor data.
