# Link Testing with iperf

iperf3 measures how much data crosses a network link in a set time. On openwifi it is the usual way to check that a link works end to end, and to compare one build or setting against another. The published openwifi throughput figures are iperf results: TCP 40 to 50 Mbps and UDP about 50 Mbps, as a best case with A-MPDU aggregation on.[^readme]

This page uses iperf3. The Kuiper image build installs both `iperf` (version 2) and `iperf3` on the board (see [Building SD Images](Building-SD-Images.md#6-install-tools-and-build-the-on-board-utilities)). Upstream does not publish the commands or the setup behind its numbers, so the procedures below are recommended practice, not the upstream method.

## What iperf3 measures

iperf3 reports goodput, the application payload delivered per second. Every layer of the stack affects that number: TCP or UDP, mac80211, the openwifi driver, the FPGA TX queues, the low MAC with its CSMA/CA, ACKs, and retransmissions, and finally the PHY. The board's ARM CPU also plays a part when the board is an endpoint or forwards the traffic.

iperf3 answers the question "does this link carry traffic at the expected rate?" It cannot isolate a PHY problem. For that, inject a known number of frames with `inject_80211` and count them on the receiver with `rx_stat_show.sh <N>`, which reports the PER (see [Packet injection](Operating-Modes.md#packet-injection-and-fuzzing) and [Statistics via sysfs](sdrctl-and-Runtime-Control.md#statistics-via-sysfs)).

Compare the result with the PHY rate. One spatial stream at 20 MHz tops out at 65 Mbps with the default 800 ns guard interval, or 72.2 Mbps with short GI. Preambles, ACKs, and contention take the rest, so about 50 Mbps is the practical ceiling (see [Wi-Fi 4 limitations](Wi-Fi-4-and-Wi-Fi-6.md#limitations-to-plan-around)).

## Test setups

The figure shows the setup from [Getting Started](Getting-Started.md): a Wi-Fi client associated with the openwifi AP, and the board connected to a host PC by Ethernet. The iperf3 server can run on the board or on the PC.

<figure class="ow-svgfig">
<svg viewBox="0 0 760 240" width="760" height="240" role="img"
     aria-label="A Wi-Fi client connects over the Wi-Fi link to the openwifi board, which connects over Ethernet to the host PC. Option A runs the iperf3 server on the board. Option B runs it on the PC, so the traffic also crosses the board and the Ethernet link."
     style="max-width:100%;height:auto;color:var(--md-default-fg-color);font-family:var(--md-text-font-family,inherit)">
  <defs>
    <marker id="ip-arrow" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
    </marker>
  </defs>

  <!-- links -->
  <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-opacity="0.75">
    <path d="M200,98 H290" stroke-dasharray="6 4"/>
    <path d="M470,98 H560"/>
  </g>
  <g font-size="11" fill="currentColor" fill-opacity="0.72" text-anchor="middle">
    <text x="245" y="88">Wi-Fi</text>
    <text x="245" y="116">under test</text>
    <text x="515" y="88">Ethernet</text>
  </g>

  <!-- nodes -->
  <g font-size="12.5" text-anchor="middle">
    <rect x="20" y="58" width="180" height="80" rx="8" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-opacity="0.45" stroke-width="1.4"/>
    <text fill="currentColor"><tspan x="110" y="84">Wi-Fi client</tspan><tspan x="110" dy="17" font-size="10.5">laptop, phone, or board</tspan><tspan x="110" dy="15" font-size="10.5">192.168.13.x</tspan></text>

    <rect x="290" y="58" width="180" height="80" rx="8" fill="#0d9488" fill-opacity="0.12" stroke="#0d9488" stroke-width="1.4"/>
    <text fill="currentColor"><tspan x="380" y="84">openwifi board</tspan><tspan x="380" dy="17" font-size="10.5">sdr0 192.168.13.1</tspan><tspan x="380" dy="15" font-size="10.5">eth0 192.168.10.122</tspan></text>

    <rect x="560" y="58" width="180" height="80" rx="8" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-opacity="0.45" stroke-width="1.4"/>
    <text fill="currentColor"><tspan x="650" y="92">host PC</tspan><tspan x="650" dy="17" font-size="10.5">192.168.10.1</tspan></text>
  </g>

  <!-- test paths -->
  <g fill="none" stroke="#6366f1" stroke-width="1.6">
    <path d="M110,162 H380" marker-start="url(#ip-arrow)" marker-end="url(#ip-arrow)"/>
    <path d="M110,204 H650" marker-start="url(#ip-arrow)" marker-end="url(#ip-arrow)"/>
  </g>
  <g font-size="11" fill="currentColor" text-anchor="middle">
    <text x="245" y="180">option A: server on the board</text>
    <text x="380" y="222">option B: server on the PC (needs the route from Getting Started step 5)</text>
  </g>
</svg>
<figcaption>The two places to run the iperf3 server. Both paths cross the Wi-Fi link, which is the part under test. Option B also crosses the board's IP forwarding and the Ethernet link.</figcaption>
</figure>

| Option | Server runs on | Needs | Use when |
|---|---|---|---|
| A | The board, at `192.168.13.1` | `iperf3` on the board image | The image has iperf3, as the Kuiper image does. This is the simplest setup. |
| B | The host PC, at `192.168.10.1` | The PC route to `192.168.13.0/24` from [Getting Started step 5](Getting-Started.md#5-give-clients-internet-access-optional), and port 5201 open in the PC firewall | The board image has no iperf3, or you want to keep the iperf3 process off the board CPU |

In option B, even 100 Mbit/s Ethernet is faster than the openwifi Wi-Fi link, so the Wi-Fi link still sets the result. The board CPU now forwards every packet, though, so keep the setup the same when you compare runs.

For a link between two openwifi boards (AP and client, or ad-hoc, see [Operating Modes](Operating-Modes.md)), both ends of the Wi-Fi link are boards. The client board needs iperf3, and the server runs on the other board or on the PC behind it.

!!! warning "Test the Wi-Fi address, not the Ethernet address"
    `192.168.10.122` is the board's Ethernet address. An iperf3 run from the PC to that address never touches the radio and measures only the Ethernet link. Always point the client at a `192.168.13.x` address, or at the PC through the board as in option B.

    One PC can be both the Wi-Fi client and the Ethernet host, but Linux may then send the test traffic over Ethernet. The route from Getting Started step 5 can take priority over the Wi-Fi interface. Before each run, check that `ip route get 192.168.13.1` names the Wi-Fi interface.

## Quick check

Run this after step 4 of [Getting Started](Getting-Started.md#4-start-the-access-point), with a laptop associated to the "openwifi" SSID. It uses option A.

On the board:

```bash
iperf3 -s
```

On the laptop, which needs iperf3 installed (builds exist for Linux, macOS, and Windows):

```bash
# laptop sends, board receives (openwifi RX path)
iperf3 -c 192.168.13.1 -t 10
# board sends, laptop receives (openwifi TX path)
iperf3 -c 192.168.13.1 -t 10 -R
```

Each run prints one line per second and a summary. Read the `receiver` line of the summary, which is the data that actually arrived. On TCP runs, the `Retr` column on the sending side counts TCP retransmissions. If it grows steadily, frames are being lost on the radio link.

What a healthy result looks like:

- The rate is steady from second to second, with no seconds at 0 bits/sec.
- With plain `./wgd.sh`, the rate is lower than the published figures, because those need A-MPDU aggregation on. The next section shows how to turn it on.
- If iperf3 cannot connect, test `ping 192.168.13.1` first. If ping works, check that `iperf3 -s` is still running on the board.

If the rate swings strongly or drops to zero for whole seconds, see [Pitfalls](#pitfalls).

## Getting the best throughput

To get close to the published numbers:

1. Load the driver with aggregation on, then start the AP:

    ```bash
    cd ~/openwifi
    ./wgd.sh 1
    ./fosdem.sh
    ```

    `fosdem.sh` neither loads the driver nor reads a `test_mode` argument, so aggregation must come from `wgd.sh`.[^fosdem] The client must support A-MPDU too, as commercial 802.11n devices generally do.

2. Use a clean 5 GHz channel. The shipped `hostapd-openwifi.conf` uses channel 36. Scan from the client and move to a quieter channel if channel 36 is busy.

3. Lock the frequency so background scans do not retune the AD9361 during a run. Channel 36 is 5180 MHz:

    ```bash
    ./set_restrict_freq.sh 5180
    ```

4. Turn off power save on a Linux client. A sleeping client adds loss and delay:

    ```bash
    sudo iw dev wlan0 set power_save off
    ```

5. Mount the board's TX and RX antennas perpendicular to each other and start at a short distance with a clear line of sight. The ADRV9361-Z7035 has very low TX power at 5 GHz and needs to be closer.

6. Keep driver dmesg logging off. Per-packet prints (bits 1 and 2 of `drv_tx` and `drv_rx` register 7) run for every frame and can lower throughput.

Then run TCP and UDP in both directions:

```bash
iperf3 -c 192.168.13.1 -t 30
iperf3 -c 192.168.13.1 -t 30 -R
# UDP needs an explicit rate. The iperf3 default for UDP is only 1 Mbit/s
iperf3 -c 192.168.13.1 -t 30 -u -b 60M
iperf3 -c 192.168.13.1 -t 30 -u -b 60M -R
```

For UDP, the useful numbers are on the `receiver` line: the received bit rate, the jitter, and `Lost/Total Datagrams`. An offered rate above the link capacity always shows loss, because the extra datagrams are dropped before or on the link. To find the highest rate the link carries cleanly, lower `-b` in steps until the loss is close to zero.

## Validation workflows

### Regression check after a driver or FPGA change

Use this after any change you load with `wgd.sh` (see [Software Development Workflow](Software-Development-Workflow.md)). Run the same test before and after the change, with as few variables as possible.

1. Record which builds are running. Each register returns a git revision in hex:

    ```bash
    ./sdrctl dev sdr0 get reg drv_xpu 7   # driver
    ./sdrctl dev sdr0 get reg rx 31       # openofdm_rx receiver
    ./sdrctl dev sdr0 get reg xpu 63      # FPGA build
    ```

2. Keep the channel, antenna placement, client, and `test_mode` the same. Lock the frequency with `set_restrict_freq.sh`.

3. Pin the openwifi TX rate so `minstrel_ht` rate adaptation does not change between runs. This fixes only the frames openwifi sends. The peer still picks its own rate.

    ```bash
    ./sdrctl dev sdr0 set reg drv_tx 1 11   # HT MCS 7, 65 Mbps
    ```

    Values 4 to 11 select MCS 0 to 7. Use a lower MCS if the link cannot hold MCS 7, and set `0` to return to automatic rate control.

4. Run TCP and UDP in both directions, as in [Getting the best throughput](#getting-the-best-throughput). Repeat each test at least three times, because single runs over the air vary.

5. Compare the results with the baseline. Test both directions every time. Traffic from the board exercises `openofdm_tx` and the TX queues, while traffic to the board exercises `openofdm_rx`, so a change can break one direction only.

Record the same fields for every run so that results from different days stay comparable:

| Field | Example |
|---|---|
| Date and board | `zed_fmcs2` |
| Driver, receiver, and FPGA revisions | Output of the three `get reg` commands |
| `test_mode` and other non-default settings | `1`, MCS pinned to 7 |
| Channel and setup | Channel 36, option A, 2 m line of sight |
| Command | `iperf3 -c 192.168.13.1 -t 30 -R` |
| Result | Receiver bit rate, plus `Retr` (TCP) or loss (UDP) |

Add `-J` to any iperf3 command to get JSON output that a script can parse and store.

### Reading iperf3 together with the counters

A low iperf3 result shows that something is wrong, but not where. The driver counters narrow it down. Enable and clear them first:

```bash
./stat_enable.sh
./tx_stat_show.sh clear
./rx_stat_show.sh clear
./tx_prio_queue_show.sh clear
```

Run one iperf3 test, then read the counters:

```bash
./tx_stat_show.sh
./rx_stat_show.sh
./tx_prio_queue_show.sh
```

| What you see | What it points to |
|---|---|
| Many TX failures or retransmissions in `tx_stat_show.sh` | The peer does not receive or acknowledge openwifi's frames. Check the RF link and the TX rate. |
| Many FCS failures in `rx_stat_show.sh` | openwifi detects frames but cannot decode them. Check the signal level, interference, and RX gain. |
| Queue stop counts growing in `tx_prio_queue_show.sh` | The FPGA TX queues fill up and the driver pauses Linux. The air link is the bottleneck. |

The counter names match variables in `sdr.c` (see [Statistics via sysfs](sdrctl-and-Runtime-Control.md#statistics-via-sysfs)). For PHY-level detail, the `openofdm_rx` watchdog counters and the side-channel event counters count events such as preamble detections and good-FCS data packets addressed to the board (see [FPGA event counters](Research-Features.md#fpga-event-counters)).

### Comparing feature settings

iperf3 gives a quick before-and-after number for any runtime setting. Change one setting at a time and rerun the same test.

| Setting | How to change it | Details |
|---|---|---|
| A-MPDU aggregation | `./wgd.sh 1` compared with `./wgd.sh` | [Turning on A-MPDU aggregation](Wi-Fi-4-and-Wi-Fi-6.md#turning-on-a-mpdu-aggregation) |
| Short guard interval | `./wgd.sh 2` or `./wgd.sh 3` | [Short guard interval](Wi-Fi-4-and-Wi-Fi-6.md#short-guard-interval) |
| Fixed MCS | `./sdrctl dev sdr0 set reg drv_tx 1 N` | [TX rate and MCS override](sdrctl-and-Runtime-Control.md#tx-rate-and-mcs-override) |
| CCA threshold | `./set_lbt_th.sh` | [CCA threshold](sdrctl-and-Runtime-Control.md#cca-threshold-listen-before-talk) |
| Contention window, NAV, DIFS, EIFS | `cw_max_min_cfg.sh` and the `*_disable.sh` scripts | [CSMA/CA internals](sdrctl-and-Runtime-Control.md#csmaca-internals-nav-difs-eifs-cw) |
| TX attenuation | `./sdrctl dev sdr0 set reg rf 0 N` | [TX power and attenuation](sdrctl-and-Runtime-Control.md#tx-power-and-attenuation) |

`wgd.sh` reloads the driver and recreates `sdr0`. After each `wgd.sh` change, restart the AP with `fosdem.sh` and reconnect the client.

An MCS sweep shows where the link starts to fail. Pin each MCS from 0 to 7 in turn and run a UDP test with `-R`, so the board sends at the pinned rate. Set `-b` to the PHY rate of that MCS from [the HT rate table](Wi-Fi-4-and-Wi-Fi-6.md#the-ht-rate-table). The received rate rises with the MCS until the link margin runs out, and loss climbs sharply after that point.

### Checking time slicing

Time slicing gates each FPGA TX queue to part of a repeating cycle, keyed by destination MAC address (see [Time slicing](sdrctl-and-Runtime-Control.md#time-slicing-network-slicing)). iperf3 shows whether the airtime split works. Connect two clients to the openwifi AP and configure one slice per client MAC address. Then start one server per client on the board:

```bash
iperf3 -s -p 5201 &
iperf3 -s -p 5202 &
```

Start both downlink tests at the same time, one from each client:

```bash
# on client 1
iperf3 -c 192.168.13.1 -p 5201 -t 30 -R
# on client 2
iperf3 -c 192.168.13.1 -p 5202 -t 30 -R
```

The two received rates should split roughly in proportion to the slice lengths. The ratio is not exact, because each slice also spends airtime on contention and per-frame overhead.

### Long runs

A long run, such as `iperf3 -c 192.168.13.1 -t 3600 -i 10`, finds problems that short runs miss. The `-i 10` option prints one line every 10 seconds instead of every second.

If the bitstream was built with the Xilinx Viterbi decoder evaluation license, reception stops after about two hours, and the rate drops to zero for the rest of the run. Check `./sdrctl dev sdr0 get reg rx 20` before you blame your change (see [Reception dies after ~2 hours](Troubleshooting.md#reception-dies-after-2-hours)).

## Pitfalls

| Symptom | Likely cause | Check |
|---|---|---|
| Rate above 72 Mbps | The traffic went over Ethernet | The target address is `192.168.13.x`. On a PC that is both client and host, `ip route get 192.168.13.1` names the Wi-Fi interface. |
| Rate far below the published figures | Aggregation is off | Load with `./wgd.sh 1`. The published figures are a best case with A-MPDU on. |
| `Connection refused` or no connection | No server running, or a firewall blocks port 5201 | `iperf3 -s` runs on the server. For option B, open TCP and UDP port 5201 on the PC. |
| Rate drops to zero for whole seconds | Weak or noisy link, or a client in power save | Antenna orientation and distance, `iw dev wlan0 get power_save`, a cleaner channel |
| Rate drops to zero after about two hours and stays there | Viterbi evaluation license halt | `./sdrctl dev sdr0 get reg rx 20` returns the same value every time |
| Heavy UDP loss | Offered rate above the link capacity | Lower `-b` until the loss is near zero |
| Results change between identical runs | Rate adaptation, scanning, or interference | Pin the MCS, lock the frequency, and repeat each test several times |
| Throughput drops with debugging on | Per-packet dmesg prints | Set `drv_tx` and `drv_rx` register 7 back to `0` (see [Driver dmesg logging](Troubleshooting.md#driver-dmesg-logging)) |

## Sources

[^readme]: openwifi [`README.md`](https://github.com/open-sdr/openwifi/blob/master/README.md): the "Performance (best case: aggregation/AMPDU on)" list gives iperf throughput as TCP 40~50Mbps and UDP 50Mbps. The README gives no commands, topology, or iperf version for these figures.
[^fosdem]: openwifi [`user_space/fosdem.sh`](https://github.com/open-sdr/openwifi/blob/master/user_space/fosdem.sh): the `test_mode` handling and the `./wgd.sh` call are commented out. The script sets the `sdr0` address, restarts the DHCP server, and starts `hostapd` and the demo webserver.
