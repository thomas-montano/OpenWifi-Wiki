# Getting Started

This page takes you from an empty SD card to a working openwifi access point that your phone or laptop can join. Budget about an hour the first time.

## 1. What you need

**Hardware**

- A supported SDR board (see table below).
- An SD card that is 16 GB or larger.
- Two antennas for 2.4 and 5 GHz, or SMA cables with at least 30 dB of attenuation for conducted tests.
- An Ethernet cable between the board and your PC.
- Optionally a USB-UART cable for a serial console, which helps a lot when networking doesn't come up.

**Supported boards.** The most common ones are below. The full matrix, per-board hardware notes, and the GPIO and LED debug map are on the [Supported Boards](Supported-Boards.md) page.

| `board_name` | Hardware | Vivado license needed to rebuild FPGA? |
|---|---|---|
| `zc706_fmcs2` | Xilinx ZC706 + AD-FMCOMMS2/3/4 | Yes |
| `zed_fmcs2` | ZedBoard (Avnet, Digilent) + AD-FMCOMMS2/3/4 | No |
| `zc702_fmcs2` | Xilinx ZC702 + AD-FMCOMMS2/3/4 | No |
| `zcu102_fmcs2` | Xilinx ZCU102 (MPSoC, 64-bit) + AD-FMCOMMS2/3/4 | Yes |
| `adrv9364z7020` | ADRV9364-Z7020 SoM + ADRV1CRR-BOB carrier | No |
| `adrv9361z7035` | ADRV9361-Z7035 SoM + ADRV1CRR-BOB/FMC carrier | Yes |
| `antsdr`, `e310v2`, `antsdr_e200` | MicroPhase enhanced ADALM-Pluto family | No |
| `sdrpi` | HexSDR Raspberry-Pi-sized SDR | No |
| `neptunesdr`, `LibreSDR` | Low-cost Zynq-7020 + AD9361 boards (community-supported, unofficial) | No |

!!! info "The `board_name` string matters"
    It selects which FPGA image and boot files you use throughout the project (the same string names the board in all the [repos](Repositories.md)). The "Vivado license" column above only matters if you rebuild the FPGA yourself. The prebuilt image works regardless.

!!! tip "No hardware?"
    If you have no board at all, the imec **[w-iLab.t testbed](https://doc.ilabt.imec.be/ilabt/wilab/tutorials/openwifi.html)** offers remote access to openwifi-ready boards.

!!! note "ZedBoard-class boards (Zynq-7020) have tighter limits"
    The ZedBoard, ADRV9364-Z7020, ZC702, `antsdr`, `sdrpi`, and other [Zynq-7020 boards](Supported-Boards.md#the-board-matrix) have less FPGA memory. Some features have lower limits on these boards, notably the IQ capture buffer length. The relevant pages give the exact limits.

## 2. Flash the SD card

1. Download the prebuilt openwifi image linked from the [openwifi README](https://github.com/open-sdr/openwifi#download-img-and-quick-start) and unzip it to a `.img` file. At the time of writing, the image is `openwifi-1.5.0-shahecheng.img.xz`.

    !!! note "Prebuilt image version"

        The prebuilt image may lag the current repository. For development with current code, follow [Software Development Workflow](Software-Development-Workflow.md) to update the board's files and build the driver against the matching kernel.

2. Write it to the SD card with an imaging tool (GNOME Disks, Startup Disk Creator, win32diskimager) or with `dd`. Check the image's sector count and your SD card device before editing the example write command:

    ```bash
    IMG=openwifi-1.5.0-shahecheng.img   # the unzipped image
    fdisk -l "$IMG"                     # the first line ends with the total sector count
    lsblk                               # identify the SD card device
    # Replace both example values, then uncomment these three lines:
    # SECTORS=31116288                  # use the count fdisk printed
    # SD=/dev/sdX                       # use your SD card device
    # sudo dd bs=512 count="$SECTORS" if="$IMG" of="$SD"
    ```

    Afterwards the card should show two partitions, `BOOT` and `rootfs`.

3. Configure the card for your board (do this on your PC before first boot):
    - Copy everything from `BOOT/openwifi/<board_name>/` into the root of the `BOOT` partition.
    - Delete `rootfs/root/kernel_modules` if it exists.
    - Delete `rootfs/etc/network/interfaces.new` if it exists (a common cause of "can't ssh to the board").

    !!! info "Only delete these if they exist"
        The `rootfs` partition is ext4, which Windows and macOS cannot mount without extra tooling (WSL or an ext4 driver). Neither deletion is required for the board to boot. `rootfs/root/kernel_modules` is a staging directory that `setup_once.sh` rebuilds on first boot, so a stale copy can shadow the fresh one.

## 3. First boot and login

1. Insert the SD card and set the board's boot-mode jumpers or switches to SD boot. Connect the antennas and power on.

    openwifi transmits and receives on the AD9361's first channel (`tx0` and `rx0`) by default, using its A ports. On FMCOMMS2/3/4 cards these are the connectors labeled **TX1A** and **RX1A**. On other boards, check the board documentation for the connectors wired to TX1 and RX1. You can switch antennas at runtime, see [Antenna selection](sdrctl-and-Runtime-Control.md#antenna-selection).

2. Give your PC's Ethernet interface the static IP `192.168.10.1` (netmask 255.255.255.0). The board boots with IP `192.168.10.122`.
3. Log in (password: `openwifi`):

    ```bash
    ssh root@192.168.10.122
    ```

    If ssh fails, connect the UART console to watch the boot, and see [Troubleshooting](Troubleshooting.md).

4. One-time setup on a fresh board:

    ```bash
    raspi-config --expand-rootfs   # only if your SD card is larger than 16 GB (reboot after)
    ./openwifi/setup_once.sh       # then reboot
    ```

    `setup_once.sh` prepares the board in these steps:

    - Detect the board name from the device-tree model string.
    - Stage the kernel modules for the board's architecture into `/root/kernel_modules` and `/root/openwifi`, and move the board-support `.ko` files next to the driver.
    - Symlink `/lib/modules/$(uname -r)` to `/root/kernel_modules` and run `depmod`.
    - Copy the board's `system_top.bit.bin` into `openwifi/`.
    - Build `sdrctl`, `side_ch_ctl`, and `inject_80211`.

    When it succeeds, the script prints the detected board name (for example `zed_fmcs2`) and finishes without an error. Then reboot.

## 4. Start the access point

On the board:

```bash
cd openwifi
./wgd.sh        # loads the FPGA image (if present) and the openwifi driver, creates NIC "sdr0"
./fosdem.sh     # starts hostapd (SSID "openwifi") plus a DHCP server and a demo webserver
```

Check that the interface came up with `ip link show sdr0`. If it does not exist, see [Troubleshooting](Troubleshooting.md).

`./wgd.sh 1` enables experimental A-MPDU aggregation for higher 11n throughput. `./fosdem-11ag.sh` forces legacy 11a/g mode.

Now look for the **"openwifi"** SSID on your phone or laptop and connect. You should receive an IP in the `192.168.13.0/24` range. Browse to `192.168.13.1` to see the on-board demo page.

The shipped `hostapd-openwifi.conf` defaults to **channel 36 (5 GHz)**. If your client device is 2.4 GHz-only, edit `~/openwifi/hostapd-openwifi.conf` on the board (the `channel=` and `hw_mode=` lines) and re-run `fosdem.sh`. Read [About 802.11b](Operating-Modes.md#about-80211b) first, since 2.4 GHz clients often fail to associate because openwifi does not support 11b rates.

!!! warning "Reception stops after about two hours"
    The FPGA uses an **evaluation license** of the Xilinx Viterbi decoder, which halts after roughly two hours of operation. When this happens, reception stops and `./sdrctl dev sdr0 get reg rx 20` keeps returning the same value. To recover, reload the FPGA (see [dynamic reloading](Software-Development-Workflow.md#reloading-driver-and-fpga-without-rebooting)) or power-cycle the board.

The ADRV9361-Z7035 has very low TX power in the 5 GHz band, so keep devices close when using that board on 5 GHz.

## 5. Give clients internet access (optional)

The board has no internet uplink, so route client traffic through your PC.

On the PC, find the internet interface and the interface connected to the board:

```bash
ip route show default
ip -br address
```

The internet interface appears after `dev` in the default route. The board-facing interface has the address `192.168.10.1`. Set the example names below to match your PC, then run the setup once:

```bash
BOARD_NIC=eth0
INTERNET_NIC=wlp0s20f3

sudo sysctl -w net.ipv4.ip_forward=1
sudo ip route replace 192.168.13.0/24 via 192.168.10.122 dev "$BOARD_NIC"
sudo iptables -I FORWARD 1 -i "$BOARD_NIC" -o "$INTERNET_NIC" -s 192.168.13.0/24 -j ACCEPT
sudo iptables -I FORWARD 1 -i "$INTERNET_NIC" -o "$BOARD_NIC" -d 192.168.13.0/24 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
sudo iptables -t nat -A POSTROUTING -s 192.168.13.0/24 -o "$INTERNET_NIC" -j MASQUERADE
```

The two `FORWARD` rules allow client requests and their replies. `MASQUERADE` translates client addresses to the PC's internet-facing address.

From a connected Linux client, test each stage in order:

```bash
ping -c 3 192.168.13.1    # client to openwifi board
ping -c 3 192.168.10.1    # board forwarding to PC
ping -c 3 1.1.1.1         # PC forwarding and NAT
ping -c 3 example.com     # DNS
```

IP forwarding resets when the PC reboots. The route and firewall rules may also disappear when you reload the PC's network or firewall configuration. For a permanent setup, enable forwarding through `sysctl.d` and configure the route and rules through the PC's network and firewall managers.

## 6. What just happened?

The board is a small Linux computer. `wgd.sh` loaded the openwifi FPGA design and kernel driver, which registered a normal Linux Wi-Fi interface called **`sdr0`**. Everything after that (`hostapd`, DHCP, `iw`, `tcpdump`) is standard Linux, working as it would with a commercial Wi-Fi card. The [Architecture Overview](Architecture.md) explains how the FPGA and the driver make this possible.

## OpenWrt as an alternative

For a router-style setup with the LuCI web interface, use a prebuilt OpenWrt image that includes openwifi. Images exist for most boards. After you flash and boot one, an `openwrt-openwifi` SSID appears on 2.4 GHz channel 1 within about a minute. See [Building SD Images → OpenWrt](Building-SD-Images.md#openwrt) for the support matrix, the quick start, and how to build your own image.
