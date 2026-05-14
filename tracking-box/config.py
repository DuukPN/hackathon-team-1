import os

ENDPOINT = "a15srqpd4angli-ats.iot.eu-west-1.amazonaws.com" 
CERT_DIR = os.environ.get("CERT_DIR", os.path.join(os.path.dirname(__file__), "certs"))
CERT_PATH = os.path.join(CERT_DIR, "certificate.pem.crt")
KEY_PATH = os.path.join(CERT_DIR, "private.pem.key")
ROOT_CA_PATH = os.path.join(CERT_DIR, "AmazonRootCA1.pem")
DEVICE_ID = "tracking-box"
