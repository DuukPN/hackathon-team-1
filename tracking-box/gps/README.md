# GPS Module (u-blox 7)

## Hardware

- **Module**: u-blox 7 (VID `1546`, PID `01a7`)
- **Interface**: USB → appears as `/dev/ttyACM0`
- **Default baud**: 9600
- **Protocol**: NMEA 0183 + UBX binary

## Setup

```bash
cd /home/pi/tracking-box/gps
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Configure 10Hz

The GPS defaults to 1Hz. Run the configure script to set 10Hz and persist to flash:

```bash
.venv/bin/python configure.py
```

This sends:
1. **UBX-CFG-RATE** with 100ms measurement period (= 10Hz)
2. **UBX-CFG-CFG** to save config to non-volatile memory

After power-cycling the GPS, it retains 10Hz. To verify without reconfiguring:

```bash
.venv/bin/python configure.py --read-only
```

## NMEA Sentences

At 10Hz, the GPS outputs these sentences per measurement cycle:

| Sentence | Content |
|----------|---------|
| `$GPGGA` | Fix, position, altitude, satellites |
| `$GPRMC` | Position, speed, course, date/time |
| `$GPVTG` | Speed (knots + km/h), course |
| `$GPGSA` | DOP and active satellites |
| `$GPGLL` | Lat/lon with time |

Key fields from `$GPRMC`:
```
$GPRMC,hhmmss.ss,A,llll.ll,N,yyyyy.yy,E,speed,course,ddmmyy,,,A*cs
         time    fix  lat       lon      knots  deg    date
```
- `A` = valid fix, `V` = void (no fix)
- Speed in knots (× 1.852 = km/h)

## Fix Status

No fix (`V`) is normal indoors. For a fix, the antenna needs clear sky view. Cold start takes 30-60s outdoors.

## Integration

The main tracking-box script (`../main.py`) should read from `/dev/ttyACM0` at 9600 baud and parse NMEA sentences for GPS coordinates. The `pyserial` package is already in the GPS venv requirements.

## Troubleshooting

```bash
# Check device exists
ls /dev/ttyACM0

# Read raw output
timeout 3 cat /dev/ttyACM0

# Check USB device
lsusb | grep -i blox

# Check baud rate
stty -F /dev/ttyACM0
```

If `/dev/ttyACM0` doesn't appear, unplug and replug the USB cable.
