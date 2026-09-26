# FPGA

openwifi's hardware lives in the [openwifi-hw](https://github.com/open-sdr/openwifi-hw) repository. It is built **on top of the [Analog Devices HDL reference designs](https://github.com/analogdevicesinc/hdl)**, and openwifi adds its own IP cores and modifications to ADI's board projects. For anything that is not specific to openwifi, the ADI wiki is often the fastest source of answers.

| If you want to | Read |
|---|---|
| Build the bitstream, deploy it to a board, or port the design to a new board | [FPGA Development](../FPGA-Development.md) |
| Understand what a core does, or what a register write reaches | [FPGA IP Cores](../FPGA-IP-Cores.md) |
| Test a change without a board, using the receiver, transmitter, and block-level testbenches | [FPGA Simulation and Testbenches](../FPGA-Simulation.md) |

The [register reference](../sdrctl-and-Runtime-Control.md#register-reference) lists what each register does, while [FPGA IP Cores](../FPGA-IP-Cores.md) shows the logic behind it. For how Linux, the driver, and the FPGA fit together, see [Architecture](../Architecture.md).
