# FAQ and Resources

## Frequently asked questions

### What hardware do you need, and how do you get it running?

Pick a board from [Supported Boards](Supported-Boards.md): the ZedBoard with an FMCOMMS2/3 card is the classic reference, and several cheaper community boards also work. Then follow [Getting Started](Getting-Started.md) to flash the SD image, boot the board, and bring up the `sdr0` interface.

### Is openwifi a real Wi-Fi chip?

openwifi is a full-stack Wi-Fi design that runs on FPGA-based SDR hardware rather than a fabricated ASIC. The FPGA behaves like a Wi-Fi chip: it presents a standard Linux Wi-Fi interface and interoperates with commercial devices. Every layer remains open and modifiable.

### Which 802.11 standards does it support?

802.11a/g and 802.11n (Wi-Fi 4) at 20 MHz in the open-source release. 802.11ax and other advanced features are commercial (see [openwifi.tech](https://openwifi.tech)). A feature-by-feature breakdown, including why there's no Wi-Fi 5, is on [Wi-Fi 4 & Wi-Fi 6 Features](Wi-Fi-4-and-Wi-Fi-6.md).

### Does it do MIMO or 40 MHz?

Not in the open-source release. openwifi's 11n implements 52 subcarriers, 5/6 coding, and 400 ns short guard interval, for a theoretical 72.2 Mbps single-stream. MIMO, 40 MHz bandwidth, and A-MSDU are **not** supported. A-MPDU aggregation is available experimentally (`./wgd.sh 1`). Full 11n with 4×4 MIMO and 40 MHz channels reaches 600 Mbps. openwifi implements only the single-stream 20 MHz subset.

### Why won't a 2.4 GHz phone connect when 5 GHz works?

openwifi is OFDM-only and not backward-compatible with 802.11b, which makes 2.4 GHz association fail. Suppress 11b rates on both ends, or use 5 GHz. See [Operating Modes → About 802.11b](Operating-Modes.md#about-80211b) for details.

### Can it work outside normal Wi-Fi frequencies?

Yes. The AD9361 tunes from 70 MHz to 6 GHz. Bring the system up on the nearest legal channel, lock the frequency so the driver stops re-tuning it, then override the RF frequency. See [sdrctl → arbitrary tuning](sdrctl-and-Runtime-Control.md#frequency-locking-and-arbitrary-tuning). Mind your local spectrum regulations.

The upstream README also lists narrower channels as possible, 2 MHz for sub-GHz 802.11ah-style work and 10 MHz for 802.11p vehicular work. Neither upstream repository documents how to set them up, so ask on the [mailing list or in Discussions](#community-and-support) before you plan around them.

### The receiver stops working after about two hours. Broken?

No. That's the Xilinx Viterbi decoder evaluation license halting. Reload the FPGA or power-cycle. See [Troubleshooting](Troubleshooting.md#reception-dies-after-2-hours).

### Do you need a paid Vivado license?

Only for some boards. Boards with the Zynq-7020 FPGA (ZedBoard, ADRV9364-Z7020, ZC702, `antsdr`, `sdrpi`, and the [community 7020 boards](Supported-Boards.md#community-boards-from-microphase-and-hexsdr)) build under the free Vivado tier. ZC706, ZCU102, and ADRV9361-Z7035 need a license to rebuild the FPGA. Either way, the prebuilt images need no license to *run*.

### Can you try it without any hardware?

Yes. The imec [w-iLab.t testbed](https://doc.ilabt.imec.be/ilabt/wilab/tutorials/openwifi.html) offers remote access to openwifi boards (and supports JTAG boot instead of SD card).

### Is an openwifi ASIC planned (for example on SkyWater sky130)?

It's frequently requested, and the team is supportive but not actively working on it. The current focus is maturing the FPGA IP to match commercial chips. A Wi-Fi chip is more complex than it looks, and cheap only because of enormous production volume.

A serious ASIC analysis would need to port many vendor IP cores, including the FFT, Viterbi decoder, FIFOs, RAM and ROM, FIR filters, AXI DMA and AXI-Lite, dividers, and multipliers. Two harder parts are the AD9361 RF interface and the AXI bus coupling to the processor. The AD9361 is an expensive SDR front end that tunes from 70 MHz to 6 GHz, not a cheap dedicated Wi-Fi radio. The AXI bus gives low latency but ties the design to its current platform. The team welcomes a larger organization leading such an effort. See the [ASIC considerations note](https://github.com/open-sdr/openwifi/blob/master/doc/asic/skywater-130-pdk-and-asic-considerations.md) for the full reasoning.

### Can you develop on Windows?

See the community [Tips for Windows users](https://github.com/open-sdr/openwifi/discussions/341) thread.

## How to cite openwifi

If you use openwifi in research, cite the VTC2020 paper:

```bibtex
@inproceedings{jiao2020openwifi,
  title={openwifi: a free and open-source IEEE802.11 SDR implementation on SoC},
  author={Jiao, Xianjun and Liu, Wei and Mehari, Michael and Aslam, Muhammad and Moerman, Ingrid},
  booktitle={2020 IEEE 91st Vehicular Technology Conference (VTC2020-Spring)},
  pages={1--2},
  year={2020},
  organization={IEEE}
}
```

You can also cite the code base:

```bibtex
@electronic{openwifigithub,
  author = {Jiao, Xianjun and Liu, Wei and Mehari, Michael and Thijs, Havinga and Muhammad, Aslam and Chen, Baiheng},
  title = {open-source IEEE802.11/Wi-Fi baseband chip/FPGA design},
  url = {https://github.com/open-sdr},
  year = {2023}
}
```

## Selected publications

A categorized list of research using openwifi (Feature/System, TSN/Real-Time, CSI Sensing/Security, Wi-Fi & Cellular 5G/6G) is in [`doc/publications.md`](https://github.com/open-sdr/openwifi/blob/master/doc/publications.md). Highlights:

- **The founding paper:** Jiao et al., [*openwifi: a free and open-source IEEE802.11 SDR implementation on SoC*](https://www.orca-project.eu/wp-content/uploads/sites/4/2020/03/openwifi-vtc-antwerp-PID1249076.pdf), VTC2020-Spring.
- **CSI sensing & privacy:** the [CSI fuzzer work](https://doi.org/10.1145/3448300.3468255) (ACM WiSec 2021) and [*Privacy Protection in WiFi Sensing via CSI Fuzzing*](https://ieeexplore.ieee.org/abstract/document/10818006) (IEEE/ACM SEC 2024).
- **Real-time and TDD:** a line of work on self-interference-free operation and critical TDD turnaround ([WoWMoM 2022](https://hdl.handle.net/1854/LU-8765231), [Computer Communications 2023](https://doi.org/10.1016/j.comcom.2023.06.026)).
- **Wi-Fi 6 and OFDMA:** experimental OFDMA and cross-technology interference studies ([INFOCOM 2024](https://ieeexplore.ieee.org/document/10620761), [EuCNC 2025](https://hdl.handle.net/1854/LU-01JZ0477NE4D3DQV6R8JCCBFJB)) and a best-paper award at ACM WiNTECH 2025 on [coordinated OFDMA with fiber backhaul](https://arxiv.org/abs/2507.10210).
- **HLS transceiver design:** accelerating FPGA Wi-Fi prototyping via High-Level Synthesis ([FCCM 2023](https://hdl.handle.net/1854/LU-01H54J3830HK78ZDAH29ZEDJHY), with a [longer version on arXiv](https://arxiv.org/abs/2305.13351)).
- **LLMs for hardware:** a [case study of LLM-assisted FPGA development](https://arxiv.org/abs/2307.07319) for wireless communication systems.

## Videos

A curated playlist lives in [`doc/videos.md`](https://github.com/open-sdr/openwifi/blob/master/doc/videos.md). Good starting points:

- First public demo and the FOSDEM presentations from 2020, 2021, and 2022.
- FSF LibrePlanet 2021: *The dawn of the free/libre WiFi chip*.
- Feature demos: CSI, WiFi CSI Radar (joint communication and sensing), and the CSI fuzzer (plus an ACM WiSec interview).
- Conceptual talks: *How a Wi-Fi chip works internally* (CCC GPN22) and *An open-source Wi-Fi chip, What, Why, and How?* (FSiC 2024).

## Community and support

- **Discussions:** <https://github.com/open-sdr/openwifi/discussions>
- **Issues:** <https://github.com/open-sdr/openwifi/issues> and <https://github.com/open-sdr/openwifi-hw/issues>
- **Mailing list:** <https://lists.ugent.be/wws/subscribe/openwifi>
- **Commercial support & advanced features:** <https://openwifi.tech>
- **Contributing:** see [Contributing to openwifi](Contributing-to-openwifi.md), with the `CONTRIBUTING.md` in each repo as the authoritative follow-up.

## Site analytics

This wiki uses GoatCounter to count page visits, referring sites, outbound link categories, search outcomes, and page feedback. It sends page paths, referring domains, link categories, search outcome counts, and feedback votes.

The analytics code does not send search terms, full referrer links, full outbound links, or query strings. It does not use cookies or browser storage. GoatCounter uses your IP address and browser information in memory for up to eight hours to estimate visits. Its default settings store aggregate counts. See [GoatCounter's privacy policy](https://www.goatcounter.com/help/privacy) for details.

## License

openwifi is dual-licensed. **AGPLv3** covers the open-source release, and [openwifi.tech](https://openwifi.tech) offers commercial licenses and advanced features. Some files are GPL-2.0-or-later or BSD-3-Clause, so check individual files. Third-party components (Analog Devices HDL, Xilinx IP, openofdm) carry their own licenses, and it's your responsibility to comply for your use case. Analog Devices' [compound-license explanation](https://github.com/analogdevicesinc/hdl/blob/master/LICENSE) is a useful model for the situation.

## Funding and origin

openwifi originated at Ghent University and imec. It received funding from the EU H2020 [ORCA project](https://www.orca-project.eu/) (grant 732174). [NLnet](https://nlnet.nl/) funded the 802.11n feature, the 802.11a/g/n maturity work, and the OpenWrt support through [NGI Zero](https://ngi.eu/).
