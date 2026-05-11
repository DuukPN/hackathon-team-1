```bash
# 1. Install modem mode tools
sudo apt update && sudo apt install usb-modeswitch usb-modeswitch-data -y
sudo reboot

# 2. Load network drivers and make them persist on boot
sudo modprobe usbnet cdc_ether rndis_host
echo -e "usbnet\ncdc_ether\nrndis_host" | sudo tee -a /etc/modules

# 3. Set 4G to lower priority (Wi-Fi metric is 600, setting 4G to 800)
# Note: check `nmcli c` if your connection is named something other than "netplan-eth0"
sudo nmcli connection modify "netplan-eth0" ipv4.route-metric 800
sudo nmcli device reapply usb0

# 4. Verify (look for usb0 with metric 800)
ip route
"""
