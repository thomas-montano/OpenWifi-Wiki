# FPGA Development

This page covers building and modifying the FPGA design in the [openwifi-hw](https://github.com/open-sdr/openwifi-hw) repository.

The design is built **on top of the [Analog Devices HDL reference designs](https://github.com/analogdevicesinc/hdl)** (see the [FPGA overview](FPGA/index.md) for how that fits together and where the [IP Cores](FPGA-IP-Cores.md) reference picks up). For anything that isn't openwifi-specific, the ADI wiki is often the fastest source of answers.

## Prerequisites

First set up the shared host toolchain on the [Environment Setup](Development-Environment-Setup.md) page (Vivado 2022.2 with Vitis, Ubuntu packages such as `libtinfo5`, and the `XILINX_DIR` and `BOARD_NAME` environment variables). FPGA builds also need the **evaluation license of the Xilinx Viterbi Decoder** installed into Vivado. This evaluation license is why a running board's decoder halts after about 2 hours (see [Troubleshooting](Troubleshooting.md#reception-dies-after-2-hours)).

Set `export XILINX_DIR=/opt/Xilinx` and `export BOARD_NAME=<your board>` before building. If the software and FPGA repos disagree on the Vivado version, match the one the repo README states at the time you build (see [Environment Setup](Development-Environment-Setup.md#xilinx-toolchain-vivado-vitis)).

## Building the bitstream

Run these from the `openwifi-hw` repo root unless noted.

1. **Prepare the ADI HDL library** (once ever):

    ```bash
    ./prepare_adi_lib.sh $XILINX_DIR
    ```

2. **Prepare ADI board-specific IP** (once per board):

    ```bash
    ./prepare_adi_board_ip.sh $XILINX_DIR $BOARD_NAME
    # You can stop it once it prints "Building <project> project [..." (<project> depends on the board)
    ```

3. **Pull in openofdm_rx** (once, and again whenever openofdm is updated):

    ```bash
    ./get_ip_openofdm_rx.sh
    ```

4. **Generate the IP repo and top-level project** (takes a while):

    ```bash
    cd boards/$BOARD_NAME/
    ../create_ip_repo.sh $XILINX_DIR
    ```

    Expect this to take tens of minutes. When it finishes, the bitstream and the `.xsa` hardware handoff file sit under the board project directory, ready for the `sdk_update.sh` step below to collect.

    If Vitis HLS errors with `'2xxxxxxxxx' is an invalid argument. Please specify an integer value`, see [Troubleshooting](Troubleshooting.md#vitis-hls-error-2xxxxxxxxx-is-an-invalid-argument), which applies the fix from [Xilinx article 76960](https://support.xilinx.com/s/article/76960).

5. **Stash the outputs** where the software build can find them:

    ```bash
    cd boards
    ./sdk_update.sh $BOARD_NAME $OPENWIFI_HW_IMG_DIR
    ```

    This copies the FPGA image (`.xsa`, `.ltx`) and git info into `$OPENWIFI_HW_IMG_DIR` so the openwifi (software) build can pick it up (see [below](#updating-the-fpga-image-on-a-running-board)).

!!! note "GUI iteration"
    The `create_ip_repo.sh` step above already runs Vivado for you. To iterate by hand, open the project in the Vivado GUI and generate the bitstream:

    ```tcl
    source ../openwifi.tcl
    # then in the GUI: Generate Bitstream
    # then: File → Export → Export Hardware → Include bitstream → Finish
    ```

Prebuilt outputs for each board live in the **openwifi-hw-img** repo under `boards/$BOARD_NAME/sdk/` (bitstream, ILA `.ltx`, init files) if you'd rather not synthesize.

## Updating the FPGA image on a running board

If you only want to swap the FPGA bitstream (just built, or taken from `openwifi-hw-img`) without a full rebuild:

```bash
cd openwifi/user_space
./boot_bin_gen.sh $XILINX_DIR $BOARD_NAME $OPENWIFI_HW_IMG_DIR/boards/$BOARD_NAME/sdk/system_top.xsa
scp ./system_top.bit.bin root@192.168.10.122:openwifi/
```

Once `system_top.bit.bin` is in the board's `openwifi/` directory, `wgd.sh` loads it before loading the driver (see [Reloading driver and FPGA without rebooting](Software-Development-Workflow.md#reloading-driver-and-fpga-without-rebooting)).

## Modifying an IP core

IP core projects live in `ip/<ip_name>/` (for example `xpu`, `tx_intf`, `rx_intf`, `openofdm_tx`, `openofdm_rx`, `side_ch`). To open one as its own Vivado project:

```bash
cd ip/<ip_name>
../create_vivado_proj.sh $XILINX_DIR <ip_name>.tcl
```

Make your changes there, then re-integrate into the board design by re-running `../create_ip_repo.sh $XILINX_DIR` from the board directory. If a complex change breaks `create_ip_repo.sh`, read `create_ip_repo.sh` / `ip_repo_gen.tcl` and adjust them (for example to include newly added files).

## Simulating an IP core

Most cores ship a top-level testbench (`*_tb.v`), which is the fastest way to develop without hardware. As a quick start, using `openofdm_rx` as the example:

1. Create the IP's Vivado project (as above): `./create_vivado_proj.sh $XILINX_DIR openofdm_rx.tcl`.
2. In Vivado: *Sources → Simulation Sources → sim_1 → dot11_tb*.
3. *SIMULATION → Run Simulation → Run Behavioral Simulation*, then **Run All (F3)**. The first run is slow because sub-IP cores compile once. Later runs are fast.
4. After editing design files, use **Relaunch Simulation**.

The [FPGA Simulation and Testbenches](FPGA-Simulation.md) page covers this in full. It describes the IQ input format, the test vectors, and which signals and dumped files to inspect. It also covers batch simulation and the transmitter and block-level unit tests.

## Conditional compilation with Verilog macros

`create_vivado_proj.sh` accepts extra arguments that become `` `define `` macros in `<ip_name>_pre_def.v`, letting you enable or disable code blocks (ILA debug cores, feature variants). The argument order:

| Position | Meaning | Example |
|---|---|---|
| First | `BOARD_NAME` | `zc706_fmcs2` |
| Second | `NUM_CLK_PER_US` | `100` for 100 MHz |
| Third through seventh | Your own macro names, which become `` `define IP_NAME_<NAME> `` | `ENABLE_DBG` |

For `openofdm_rx`, the third argument instead selects the simulation `SAMPLE_FILE`, changeable later in the pre_def file.

When building the **top-level** project, pass the *same* macros to `create_ip_repo.sh` so the IP is compiled identically:

```bash
./create_ip_repo.sh $XILINX_DIR \
  xpu ENABLE_DBG tx_intf ENABLE_DBG rx_intf ENABLE_DBG \
  openofdm_tx ENABLE_DBG openofdm_rx ENABLE_DBG side_ch ENABLE_DBG
```

(That example turns on the ILA debug cores in every core. Only `xpu`, `tx_intf`, `rx_intf`, `openofdm_tx`, `openofdm_rx`, and `side_ch` accept macros here.)

Pair these FPGA macros with the driver's conditional-compile arguments (see [Software Development Workflow](Software-Development-Workflow.md#conditional-compilation)) to build matched driver+FPGA variants, then package them with [`drv_and_fpga_package_gen.sh`](Software-Development-Workflow.md#reloading-driver-and-fpga-without-rebooting).

## Changing the baseband clock

The default baseband clock is 100 MHz, set by `NUM_CLK_PER_US` at the top of `boards/openwifi.tcl` in the openwifi-hw repo. Available options depend on the board: 240/100 MHz on ZCU102, 100/200 MHz on ZC706 and ADRV9361-Z7035, and 100 MHz elsewhere. Change the value and re-run `openwifi.tcl` to regenerate the project.

## Adapting the design for 10 MHz or 2 MHz channels

The [openwifi README](https://github.com/open-sdr/openwifi/blob/master/README.md) lists 10 MHz for 802.11p-style experiments and 2 MHz for sub-GHz 802.11ah-style experiments. The released bitstream and driver implement 20 MHz OFDM. There is no runtime bandwidth setting or ready-made narrow-channel image. The steps below identify the changes needed for a matched experimental build. They are derived from the current source and [guidance from the maintainer](https://github.com/open-sdr/openwifi/issues/155#issuecomment-1093007327). Neither target has been verified as a working release.

| Target channel | OFDM sample rate | AD9361 sample rate with the existing 2:1 FPGA decimator and interpolator | OFDM symbol with guard interval | Legacy preamble and SIGNAL |
|---|---:|---:|---:|---:|
| 10 MHz | 10 Msps | 20 Msps | 8 µs | 40 µs |
| 2 MHz | 2 Msps | 4 Msps | 40 µs | 200 µs |

The table assumes the same 64-point OFDM waveform scaled in time. It does not turn the design into a complete 802.11p or 802.11ah implementation.

1. **Trace the active FPGA sample pacing.** In the current [`rx_iq_intf.v`](https://github.com/open-sdr/openwifi-hw/blob/master/ip/rx_intf/src/rx_iq_intf.v), `RX_IQ_RATE_ADAPTATION_BYPASS` forwards `bw20_iq_valid` as the receiver sample strobe. During normal RF reception, [`rx_intf.v`](https://github.com/open-sdr/openwifi-hw/blob/master/ip/rx_intf/src/rx_intf.v) gets that valid signal from `adc_intf.v`. The `NUM_CLK_PER_SAMPLE` counter path in `rx_iq_intf.v` is inactive. Changing `SAMPLING_RATE_MHZ` in [`ip/board_def.v`](https://github.com/open-sdr/openwifi-hw/blob/master/ip/board_def.v) or widening those five-bit counters alone leaves the active RX sample timing unchanged. Verify the sample-valid rate through the active RX path and review other FPGA logic that assumes 20 Msps. Keep `NUM_CLK_PER_US` at the board-supported FPGA clock. It sets FPGA processing speed and microsecond timers, not RF channel width.
2. **Keep the RF and FPGA sample rates matched.** The RX path in [`adc_intf.v`](https://github.com/open-sdr/openwifi-hw/blob/master/ip/rx_intf/src/adc_intf.v) keeps every second AD9361 sample. The TX path in [`dac_intf.v`](https://github.com/open-sdr/openwifi-hw/blob/master/ip/tx_intf/src/dac_intf.v) inserts a zero between baseband samples. With those paths unchanged, use the AD9361 rates in the table. Check their valid signals and FIFO behavior in simulation after changing clocks. A direct one-to-one RF and baseband rate instead requires changing both paths and their handshakes, as the maintainer describes in [issue #155](https://github.com/open-sdr/openwifi/issues/155).
3. **Prepare a matching AD9361 filter and initialization script.** Copy [`rf_init_11n.sh`](https://github.com/open-sdr/openwifi/blob/master/user_space/rf_init_11n.sh) and replace its 40,000,000 Hz input and output sampling-frequency values with 20,000,000 Hz for a 10 MHz channel or 4,000,000 Hz for a 2 MHz channel. Design a new `.ftr` file for that rate and occupied spectrum, using the [shipped filter file](https://github.com/open-sdr/openwifi/blob/master/user_space/openwifi_ad9361_fir_tx_0MHz_11n.ftr) as a format example. Set both RF bandwidth values in the script to match the new filter design. The shipped `.ftr` file and RF bandwidth values are for the 20 MHz waveform. [`wgd.sh`](https://github.com/open-sdr/openwifi/blob/master/user_space/wgd.sh) calls `rf_init_11n.sh` before loading the modules, so make it call your variant. The IIO sysfs values should read back at the intended rates after the script runs.
4. **Update and rebuild the driver.** In [`sdr.c`](https://github.com/open-sdr/openwifi/blob/master/driver/sdr.c), `priv->rf_bw = 40000000` selects the 40 MHz RX and TX interface configuration. The probe code accepts only 20 MHz and 40 MHz values, and rejects other values. Extend that mode selection and its interface settings for the new AD9361 rate. The calls that would set the AD9361 clock chain and RF bandwidth from `priv->rf_bw` are disabled under `#if 0`, so the current probe path leaves the script's RF settings in place. Check those settings after loading the modules. The driver also reports `RATE_INFO_BW_20` for received packets. For 10 MHz operation exposed through Linux, add the appropriate 10 MHz channel-width capability and report the actual RX width. The bundled `nl80211.h` lists 10 MHz but does not enable it in the openwifi driver. The kernel and regulatory channel list must also permit the selected frequency. For 2 MHz, Linux has no equivalent 2 MHz OFDM channel width in this driver, so treat the Linux interface as an experimental control path and verify the actual width at RF.
5. **Rework MAC timing and rate reporting.** The table gives the new symbol and legacy preamble durations. The ACK, CTS, timeout, and duration calculations in [`sdr.c`](https://github.com/open-sdr/openwifi/blob/master/driver/sdr.c), [`xpu.c`](https://github.com/open-sdr/openwifi/blob/master/driver/xpu/xpu.c), and [`tx_intf.c`](https://github.com/open-sdr/openwifi/blob/master/driver/tx_intf/tx_intf.c) contain values calibrated for 20 MHz. Update them for the target waveform, and check the Linux rate table so it does not advertise 20 MHz data rates. The maintainer also warns that RSSI and CCA calibration changes with the RF and FPGA configuration.
6. **Build and measure the matched image.** Rebuild the FPGA as described [above](#building-the-bitstream), rebuild the driver as described in [Software Development Workflow](Software-Development-Workflow.md), and load both on each test board. Check the AD9361 sampling-frequency and RF-bandwidth sysfs values after `wgd.sh`, measure the transmitted spectrum and packet duration, then test receive and ACK timing between two boards configured identically. Use a shielded setup or an attenuated cable link for the first tests. Changing the `iw` frequency only changes the center frequency and does not demonstrate a narrow channel.

After loading the matched FPGA and driver on a board, read back the RF settings from the AD9361 IIO device:

```bash
for device in /sys/bus/iio/devices/iio:device*; do
    if [ -f "$device/in_voltage_rf_bandwidth" ]; then
        grep -H . "$device"/{in,out}_voltage_{sampling_frequency,rf_bandwidth}
    fi
done
```

For 10 MHz vehicular use, a working narrow OFDM waveform still needs the appropriate 802.11p channel, MAC timing, and regulatory behavior. For 2 MHz sub-GHz use, scaling legacy OFDM does not implement the 802.11ah S1G PHY or its MAC. The [802.11p discussion](https://github.com/open-sdr/openwifi/issues/394) reports that a 10 MHz FPGA and RF modification did not establish a working ad-hoc link, so verify the complete link before treating either target as supported.

## High-Level Synthesis (HLS) modules

Two receiver modules, channel estimation (`ch_gain_cal`) and equalization (`equalizer`), are also available as C++ that Vitis HLS turns into Verilog, which can speed up algorithm development.

**To build with the HLS receiver:** follow the bitstream build up to *before* generating `ip_repo`, then switch `openofdm_rx` to the HLS branch:

```bash
cd ip/openofdm_rx
git checkout dot11zynq_hls
```

Continue the build. Before generating the bitstream, select `openofdm_rx` under *IP Status* and click *Upgrade Selected*.

**To modify the HLS code:**

1. Run `./get_ip_openofdm_rx.sh` and check out `dot11zynq_hls`.
2. In Vitis HLS, create a project importing the source files (except `*_test.cpp`) from the [`ch_gain_cal`](https://github.com/open-sdr/openofdm/tree/dot11zynq_hls/hls/ch_gain_cal) or [`equalizer`](https://github.com/open-sdr/openofdm/tree/dot11zynq_hls/hls/equalizer) folder. Choose that module as top level and its `*_test.cpp` as testbench, and select the FPGA part for your board.
3. Run C-sim and co-sim. When they pass, *Export RTL* produces a ZIP whose `hdl/verilog` folder replaces the corresponding folder under `openwifi-hw/ip/openofdm_rx/hls/.../hdl/verilog/`.
4. Update `openofdm_rx.tcl` to include the new files ([example](https://github.com/open-sdr/openofdm/blob/dot11zynq_hls/openofdm_rx.tcl#L268)).
5. If you changed the top-level function arguments, wire them up in [`dot11.v`](https://github.com/open-sdr/openofdm/blob/dot11zynq_hls/verilog/dot11.v).
6. Resume the normal build from "generate ip_repo."

For background, see the [FCCM 2023 poster](https://arxiv.org/abs/2305.13351).

## Migrating to a new Vivado or ADI release

Two approaches:

- **Vivado auto-upgrade.** Create the design in the current Vivado version, then open it in the target version and let Vivado upgrade it. Export the upgraded project as a `.tcl` and diff it against the original `openwifi.tcl` to see what changed. openwifi's own commits on `openwifi.tcl` show how past migrations were handled.
- **Start fresh from the new ADI reference design, then add openwifi IP.** Export the openwifi IP hierarchy from the current design with `write_bd_tcl`. Then `source` it into the new ADI reference design and instantiate it:

    ```tcl
    write_bd_tcl -hier_blks [get_bd_cells /hier_mig] ./mig_hierarchy.tcl
    source ./mig_hierarchy.tcl
    create_hier_cell_hier_mig / my_new_hierarchy
    ```

The primary reference is Xilinx UG994 (*Designing IP Subsystems Using IP Integrator*).

## Porting to a new board

openwifi's baseline is tag `2022_R2` of the ADI HDL reference designs (the `adi-hdl` submodule pin). To port, **diff openwifi against the matching ADI reference design, then replicate those changes on your target board.**

1. Open the ADI reference design for your platform (for example `hdl/projects/fmcomms2/zc706`) and the corresponding openwifi board design (`openwifi-hw/boards/zc706_fmcs2`) side by side.
2. Use *Open Block Design* and compare both the **diagram** and the **Address Editor**. That's where openwifi's additions show up.
3. The addresses and interrupts of every FPGA block hooked to the ARM bus must be reflected in the board's device tree, `openwifi/kernel_boot/boards/<board_name>/devicetree.dts`. Linux parses `devicetree.dtb` at boot to discover these blocks. (openwifi obtains a `.dts` by running `dtc` on the ADI image's `.dtb`, then edits it to match the added or modified blocks.) The device-tree half of a port is covered step by step in [Porting the device tree to a new board](Boot-Kernel-Device-Tree.md#porting-the-device-tree-to-a-new-board).
4. Study the image-build scripts (see [Software Development Workflow](Software-Development-Workflow.md#building-a-full-sd-image-from-scratch)) to understand how `devicetree.dtb`, `BOOT.BIN`, and the kernel come together into a bootable SD image.

## Debugging on hardware

Use the Xilinx **ILA** (Integrated Logic Analyzer) to watch internal FPGA signals in real time. It is the clearest way to understand the low-MAC and interface state machines in `xpu`, `tx_intf`, and `rx_intf`. Enable the debug macros (see conditional compilation above) to insert ILA cores. The prebuilt `.ltx` in openwifi-hw-img matches the shipped bitstreams. Background and an example are in [openwifi-hw issue #39](https://github.com/open-sdr/openwifi-hw/issues/39). See also the [GPIO and LED map](https://github.com/open-sdr/openwifi-hw/blob/master/gpio_led.md). It routes signals such as `tx_bb_is_ongoing`, `tx_rf_is_ongoing`, `fcs_ok`, and `demod_is_ongoing` to board LEDs and PMOD pins, so you can probe them with a scope or logic analyzer.
