"""
Configure u-blox 7 GPS to 10Hz output rate and read NMEA sentences.
Sends UBX-CFG-RATE to set measurement period to 100ms.
"""

import serial
import struct
import time
import sys

DEVICE = "/dev/ttyACM0"
BAUD = 9600


def ubx_checksum(cls: int, msg_id: int, payload: bytes) -> tuple[int, int]:
    ck_a, ck_b = 0, 0
    for b in [cls, msg_id, len(payload) & 0xFF, (len(payload) >> 8) & 0xFF] + list(payload):
        ck_a = (ck_a + b) & 0xFF
        ck_b = (ck_b + ck_a) & 0xFF
    return ck_a, ck_b


def ubx_message(cls: int, msg_id: int, payload: bytes) -> bytes:
    length = len(payload)
    ck_a, ck_b = ubx_checksum(cls, msg_id, payload)
    return struct.pack("<2sBBH", b"\xb5\x62", cls, msg_id, length) + payload + bytes([ck_a, ck_b])


def cfg_rate(meas_rate_ms: int = 100, nav_rate: int = 1, time_ref: int = 1) -> bytes:
    """UBX-CFG-RATE: set measurement rate. 100ms = 10Hz."""
    payload = struct.pack("<HHH", meas_rate_ms, nav_rate, time_ref)
    return ubx_message(0x06, 0x08, payload)


def cfg_save() -> bytes:
    """UBX-CFG-CFG: save current config to flash/BBR."""
    clear_mask = 0x00000000
    save_mask = 0x0000FFFF
    load_mask = 0x00000000
    payload = struct.pack("<III", clear_mask, save_mask, load_mask)
    return ubx_message(0x06, 0x09, payload)


def configure_10hz(port: serial.Serial):
    print("→ Sending UBX-CFG-RATE (100ms = 10Hz)...")
    port.write(cfg_rate(100))
    time.sleep(0.1)

    print("→ Saving config...")
    port.write(cfg_save())
    time.sleep(0.1)

    print("✓ GPS configured for 10Hz")


def read_nmea(port: serial.Serial, duration: float = 5.0):
    """Read and print NMEA sentences for `duration` seconds."""
    print(f"\n→ Reading NMEA for {duration}s...")
    start = time.time()
    count = 0
    while time.time() - start < duration:
        line = port.readline().decode("ascii", errors="ignore").strip()
        if line.startswith("$GPRMC") or line.startswith("$GPGGA"):
            count += 1
            print(f"  {line}")
    print(f"\n✓ Got {count} position sentences in {duration}s (~{count/duration:.1f} Hz)")


def main():
    print(f"Opening {DEVICE} at {BAUD} baud...")
    port = serial.Serial(DEVICE, BAUD, timeout=1)
    time.sleep(0.5)
    port.reset_input_buffer()

    if "--read-only" not in sys.argv:
        configure_10hz(port)
        time.sleep(0.5)

    read_nmea(port, duration=5.0)
    port.close()


if __name__ == "__main__":
    main()
