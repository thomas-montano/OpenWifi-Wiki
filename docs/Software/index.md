# Software

openwifi's software lives in the [openwifi](https://github.com/open-sdr/openwifi) repository. The kernel modules in `driver/` sit between Linux `mac80211` and the FPGA, and the on-board tools and scripts are in `user_space/`. The driver is a Linux **platform driver** built against the [Analog Devices kernel](https://github.com/analogdevicesinc/linux), so ADI's kernel patches are a prerequisite for everything here.

| If you want to | Read |
|---|---|
| Rebuild the driver or `sdrctl`, deploy them without rebooting, or build SD images | [Software Development Workflow](../Software-Development-Workflow.md) |
| Understand the kernel modules, the `mac80211` callbacks, and the transmit and receive paths | [The Linux Driver](../Driver-Architecture.md) |
| Chase a load-order problem or a packet that does not arrive | [The Linux Driver](../Driver-Architecture.md) |

Set up the shared host toolchain on the [Environment Setup](../Development-Environment-Setup.md) page first. For the FPGA half of the stack see [FPGA](../FPGA/index.md), and for how Linux, the driver, and the FPGA fit together see [Architecture](../Architecture.md).
