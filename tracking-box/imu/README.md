# IMU Sensor (BNO055)

## Hardware

- **Sensor**: Adafruit BNO055 9-DOF Absolute Orientation IMU
- **Bridge**: Microchip MCP2221A USB-to-I2C (VID `04d8`, PID `00dd`)
- **Interface**: USB → HID → I2C → BNO055 at address `0x28`
- **Connector**: STEMMA QT / Qwiic (I2C)

## Setup

```bash
cd /home/pi/tracking-box/imu
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### udev Rule

The MCP2221A needs a udev rule to allow non-root access and unbind the kernel HID driver:

```bash
sudo bash -c 'cat > /etc/udev/rules.d/99-mcp2221.rules << EOF
SUBSYSTEM=="usb", ATTRS{idVendor}=="04d8", ATTRS{idProduct}=="00dd", MODE="0666"
ACTION=="add", ATTRS{idVendor}=="04d8", ATTRS{idProduct}=="00dd", RUN+="/bin/sh -c echo %k > /sys/bus/hid/drivers/hid-generic/unbind"
EOF
sudo udevadm control --reload-rules && sudo udevadm trigger'
```

### Environment

The `BLINKA_MCP2221=1` env var tells Adafruit Blinka to use the MCP2221A as the I2C bus. This is set in the systemd service and in `imu.sh`.

## Sensor Data

| Channel | Values | Unit | Range |
|---------|--------|------|-------|
| Accelerometer | x, y, z | m/s² | ±16g |
| Gyroscope | x, y, z | rad/s | ±2000°/s |
| Magnetometer | x, y, z | µT | ±1300 µT |

## Calibration

The BNO055 auto-calibrates. Status is reported as 0-3 per subsystem:

| Level | Meaning |
|-------|---------|
| 0 | Uncalibrated |
| 1-2 | Partially calibrated |
| 3 | Fully calibrated |

- **Gyroscope**: Calibrates when stationary (~5s)
- **Accelerometer**: Calibrates with slow movements in different orientations
- **Magnetometer**: Calibrates with figure-8 motions
- **System**: Calibrates when all subsystems reach level 3

## Troubleshooting

```bash
# Check MCP2221A is connected
lsusb | grep -i microchip

# Check hidraw device exists
ls /dev/hidraw*

# Quick sensor test
BLINKA_MCP2221=1 python3 -c "
import board, adafruit_bno055
sensor = adafruit_bno055.BNO055_I2C(board.I2C())
print(sensor.acceleration, sensor.gyro, sensor.magnetic)
"

# Check calibration
BLINKA_MCP2221=1 python3 -c "
import board, adafruit_bno055
sensor = adafruit_bno055.BNO055_I2C(board.I2C())
print('Cal (sys,gyro,accel,mag):', sensor.calibration_status)
"
```

If `open failed` on HID device, check that the udev rule is installed and the hid-generic driver is unbound.
