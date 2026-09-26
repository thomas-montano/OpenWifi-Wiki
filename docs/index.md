<div class="ow-hero" markdown>
<span class="ow-hero__tag">Open-source Wi-Fi on SDR</span>

# openwifi Wiki

This wiki is a plain-language guide to **openwifi**, a free and open-source, full-stack IEEE 802.11 (Wi-Fi) implementation compatible with Linux `mac80211`. It runs on SDR hardware built around Xilinx Zynq SoCs, usually paired with the Analog Devices AD9361 RF front end.

<div class="ow-hero__cta" markdown>
[Get started](Getting-Started.md){ .ow-primary }
[How it's built](Architecture.md){ .ow-ghost }
[The repositories](Repositories.md){ .ow-ghost }
</div>
</div>

Unlike a commercial Wi-Fi chip, every layer of openwifi is open and modifiable. The OFDM PHY and the real-time low MAC (CSMA/CA) run in FPGA fabric, below a standard Linux SoftMAC driver. Everything above the driver is the ordinary Linux wireless stack, including `hostapd`, `wpa_supplicant`, `iw`, and Wireshark.

!!! warning "Spectrum regulation notice"
    Transmitting over the air is regulated everywhere. It is *your* responsibility to comply with your local spectrum regulations. When in doubt, use coaxial cable with attenuators, or a shielded chamber, instead of antennas.

## What openwifi can do

- **802.11a/g/n operation** at 20 MHz bandwidth, with the RF front end tunable from 70 MHz to 6 GHz. Upstream also lists 2 MHz (802.11ah-style) and 10 MHz (802.11p) as adaptation targets. See the [narrow-channel setup path](FPGA-Development.md#adapting-the-design-for-10-mhz-or-2-mhz-channels).
- **All the usual roles**: Access Point, client (station), ad-hoc, and monitor mode, all driven by the standard Linux tools.
- **A real-time low MAC in FPGA**: DCF (CSMA/CA) that meets 802.11 SIFS timing (10 µs in 2.4 GHz, 16 µs in 5 GHz). It includes hardware ACK generation, retransmission, RTS/CTS, and NAV. You can configure or disable each of these for experiments.
- **Research features** that a commercial chip does not provide. These include per-packet CSI extraction, raw IQ capture with dozens of trigger conditions, and packet injection and fuzzing. There is also a CSI fuzzer for privacy research, full-duplex self-reception ("Wi-Fi as radar"), and time-sliced FPGA transmit queues for [network slicing](sdrctl-and-Runtime-Control.md#time-slicing-network-slicing).
- **Throughput** in its best configuration (802.11n with A-MPDU aggregation): 40 to 50 Mbps TCP and about 50 Mbps UDP in iperf.
- **RF quality**: EVM around −38 dB, and receiver sensitivity around −92 dBm at MCS0 and −73 dBm at MCS7 (measured with FMCOMMS2 at 2.4 GHz).

!!! note "Not in the open-source release"
    MIMO and 40 MHz bandwidth are *not* supported in the open-source release. 802.11ax and other advanced features are part of the commercial offering at [openwifi.tech](https://openwifi.tech).

## The repositories

The project is split across four repositories, because the driver and the FPGA design use different toolchains. The [Repositories guide](Repositories.md) explains why, and **where to look for what you need to change**.

| Repository | Contents |
|---|---|
| [openwifi](https://github.com/open-sdr/openwifi) | Linux kernel driver, user-space tools (`sdrctl`, capture scripts, demo scripts), SD-card boot files, documentation |
| [openwifi-hw](https://github.com/open-sdr/openwifi-hw) | FPGA design: the openwifi [IP cores](FPGA-IP-Cores.md) plus board-level Vivado projects |
| [openwifi-hw-img](https://github.com/open-sdr/openwifi-hw-img) | Prebuilt FPGA bitstreams per board, so you can skip hours of synthesis |
| [openofdm](https://github.com/open-sdr/openofdm) (`dot11zynq` branch, forked from [jhshi/openofdm](https://github.com/jhshi/openofdm)) | The 802.11 OFDM receiver that openwifi's `openofdm_rx` IP is based on |

## Where to go next

**New to the project?** Follow these five in order. They take you from "what is this" to bringing up your own board.

<div class="grid cards" markdown>

-   :material-source-branch:{ .lg .middle } __1. The Repositories__

    ---

    The four repos, why the project is split, and where to look for anything.

    [:octicons-arrow-right-24: The Repositories](Repositories.md)

-   :material-rocket-launch:{ .lg .middle } __2. Getting Started__

    ---

    The hardware you need, flashing the SD card, and bringing up your first openwifi AP.

    [:octicons-arrow-right-24: Getting Started](Getting-Started.md)

-   :material-sitemap:{ .lg .middle } __3. Architecture Overview__

    ---

    How the FPGA, driver, and Linux stack fit together. Required reading before touching code.

    [:octicons-arrow-right-24: Architecture Overview](Architecture.md)

-   :material-developer-board:{ .lg .middle } __4. Supported Boards__

    ---

    The board matrix, per-board hardware notes, and the GPIO and LED debug map.

    [:octicons-arrow-right-24: Supported Boards](Supported-Boards.md)

-   :material-access-point:{ .lg .middle } __5. Operating Modes__

    ---

    AP, client, ad-hoc, monitor, and packet injection walkthroughs.

    [:octicons-arrow-right-24: Operating Modes](Operating-Modes.md)

</div>

**Explore by area.** Each card jumps into a part of the project. The sidebar lists every page within that area.

<div class="grid cards" markdown>

-   :material-access-point:{ .lg .middle } __Using openwifi__

    ---

    Run openwifi as an AP, client, ad-hoc, or monitor, and control it at runtime with `sdrctl`: TX power, rates, gain, CCA, ACK behavior, and frequency.

    [:octicons-arrow-right-24: Operating Modes](Operating-Modes.md)

-   :material-tools:{ .lg .middle } __Developing__

    ---

    Rebuild the driver, work on the FPGA IP cores, build SD images, and port openwifi to a new board.

    [:octicons-arrow-right-24: Software Development Workflow](Software-Development-Workflow.md)

-   :material-waveform:{ .lg .middle } __Research features__

    ---

    Per-packet CSI, raw IQ capture, CSI radar and fuzzer, loopback testing, and the counters and statistics.

    [:octicons-arrow-right-24: Research Features](Research-Features.md)

-   :material-file-document-multiple:{ .lg .middle } __Application notes__

    ---

    An index of the application notes, with figures and links into the relevant wiki sections.

    [:octicons-arrow-right-24: Application Notes](Application-Notes.md)

-   :material-lifebuoy:{ .lg .middle } __Help & support__

    ---

    Troubleshooting by symptom, the glossary, the FAQ and resources, and how to contribute.

    [:octicons-arrow-right-24: Troubleshooting](Troubleshooting.md)

</div>

## License and attribution

openwifi is dual-licensed. **AGPLv3** covers the open-source release, and [openwifi.tech](https://openwifi.tech) offers commercial licenses. The project includes third-party components with their own license terms, such as Analog Devices HDL, Xilinx IP like the Viterbi decoder, and the openofdm receiver. Verify each component's license for your intended use. openwifi was created at Ghent University and imec by Xianjun Jiao, Wei Liu, Michael Mehari, and contributors. Funding came from the EU H2020 ORCA project and from NLnet through NGI Zero.

The pages here rewrite and restructure the documentation that lives in the openwifi repositories. The code and the repos are always the source of truth. If the wiki and the repos disagree, trust the repos, and please fix the wiki.
