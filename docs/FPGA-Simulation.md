# FPGA Simulation and Testbenches

Simulation lets you develop and debug openwifi's FPGA logic without a board. You feed a recorded or generated IQ file to a testbench, run it in the Vivado simulator, then inspect the receiver's signals in the waveform view or in dumped text files. You can check each design change before you spend an hour synthesizing a bitstream.

Everything on this page is behavioral simulation. The Vivado simulator (XSim) runs the Verilog source and the simulation models of the Xilinx IP cores directly, without synthesis, placement, or routing. It shows whether the logic is correct. It does not show whether the design meets timing on the FPGA.

This page is the deep reference for that environment. For the surrounding build, deploy, and port workflow, see [FPGA Development](FPGA-Development.md). For what each core does, see [FPGA IP Cores](FPGA-IP-Cores.md).

## Before you start

You need a Linux host with Vivado 2022.2 installed and `XILINX_DIR` set, as described in the [FPGA Development prerequisites](FPGA-Development.md#prerequisites). The project scripts source `$XILINX_DIR/Vivado/2022.2/settings64.sh` directly, so Vivado must be installed at exactly that path. You also need a clone of [openwifi-hw](https://github.com/open-sdr/openwifi-hw). You do not need a board.

The receiver simulation also needs a valid license for the Xilinx Viterbi Decoder IP, the same evaluation license the bitstream build uses. Without it, Vivado reports the IP as locked, generates no simulation model for it, and elaboration stops with `ERROR: [VRFC 10-2063] Module <viterbi_v7_0> not found`. The evaluation license expires, so check its date in Vivado's License Manager when this error appears on a setup that used to work.

## Quick reference

Paths are relative to the `openwifi-hw` root.

| Item | Location or value |
|---|---|
| Receiver source (git submodule) | `ip/openofdm_rx/`, empty until you run `./get_ip_openofdm_rx.sh` |
| Receiver testbench | `ip/openofdm_rx/verilog/dot11_tb.v` |
| Generated macro file | `ip/openofdm_rx/verilog/openofdm_rx_pre_def.v` |
| Receiver Vivado project | `ip/openofdm_rx/openofdm_rx/openofdm_rx.xpr` |
| Simulation working directory, where the dumps land | `ip/openofdm_rx/openofdm_rx/openofdm_rx.sim/sim_1/behav/xsim/` |
| Default IQ vector | `ip/openofdm_rx/testing_inputs/simulated/ht_mcs7_gi1_aggr0_len14_pre100_post200_openwifi.txt` |
| IQ file format | 20 MSPS, one `I Q` pair per line, plus a [metadata line](#the-metadata-line) |
| Simulated time per launch | 1000 ns, then press **Run All** to finish |
| Pass criterion | Each line of `fcs_out.txt` ends in `1` |
| Transmitter testbench | `ip/openofdm_tx/src/dot11_tx_tb.v`, which writes `dot11_tx.txt` |

## Kinds of testbench

openwifi's HDL ships three tiers of testbench. Choose the one that matches the change you are making.

| Tier | Testbench | Where | Drives | Good for |
|---|---|---|---|---|
| **Full receiver** | `dot11_tb` | [`openofdm/verilog/`](https://github.com/open-sdr/openofdm/tree/dot11zynq/verilog) | The whole `dot11` receive chain from an IQ file | Sync, channel estimation, equalization, demod, Viterbi, FCS |
| **Full transmitter** | `dot11_tx_tb` | [`openwifi-hw/ip/openofdm_tx/src/`](https://github.com/open-sdr/openwifi-hw/tree/master/ip/openofdm_tx/src) | `openofdm_tx` from a TX memory image | Encoding, modulation, IFFT, preamble insertion |
| **Block-level unit test** | `adc_intf_tb`, `mv_avg_tb`, `fifo_sample_delay_tb` | `openwifi-hw/ip/<core>/unit_test/<block>/` | One submodule with hand-written or file-based stimulus | A single register, FIFO, or math block in isolation |

The full-chain benches are the ones you spend most time in. The block-level unit tests are small and fast, and they exist only for the handful of blocks that are worth checking on their own (see the [IP Cores table](FPGA-IP-Cores.md#the-signal-chain)).

## The openofdm_rx receiver testbench (`dot11_tb`)

This is the main simulation environment. `dot11_tb` instantiates the `dot11` receiver, streams an IQ file into it one sample at a time, and records what comes out. It also instantiates `signal_watchdog`, which resets the receiver when a packet header looks implausible, so watchdog resets show up in simulation too.

### Running your first simulation

1. Pull in the receiver submodule and create its Vivado project. Run this from the `openwifi-hw` root:

    ```bash
    ./get_ip_openofdm_rx.sh
    cd ip/openofdm_rx
    ./create_vivado_proj.sh $XILINX_DIR openofdm_rx.tcl
    ```

    The Vivado window opens with the project loaded. Without extra arguments, the project targets `zed_fmcs2` with a 100 MHz clock and uses the default IQ vector. [Choosing the IQ file](#choosing-the-iq-file) shows how to pass other values.

2. In the **Sources** window, expand *Simulation Sources → sim_1*. `dot11_tb` is already the simulation top and is shown in bold.
3. In the **Flow Navigator** on the left, click *SIMULATION → Run Simulation → Run Behavioral Simulation*. The first launch compiles the simulation model of every Xilinx IP core and can take several minutes. Later launches are fast.
4. The simulation pauses after 1000 ns, the project's default run time. Press **Run All** (F3), or type `run all` in the **Tcl Console** at the bottom of the window. The testbench ends the run itself with `$finish` 300 samples after the IQ file runs out.
5. After you edit a design file, click **Relaunch Simulation**, or type `relaunch_sim`. It recompiles the changed files without recreating the project.

Then check the result from a terminal:

```bash
# from ip/openofdm_rx
cd openofdm_rx/openofdm_rx.sim/sim_1/behav/xsim
cat sample_file_name.txt && echo
cat fcs_out.txt
```

`sample_file_name.txt` confirms which IQ file the run opened. `fcs_out.txt` has one line per decoded packet: the sample index, then `fcs_ok`, which is `1` when the CRC passed and `0` when it failed. The default vector holds one packet, so a passing run writes one line that ends in `1`. The run ends at 69695 ns. If `fcs_out.txt` is empty, the receiver never reached the end of a packet. See [Troubleshooting a run](#troubleshooting-a-run).

A passing run of the default vector looks like this:

```console
$ cat sample_file_name.txt && echo
../../../../../testing_inputs/simulated/ht_mcs7_gi1_aggr0_len14_pre100_post200_openwifi.txt
$ cat fcs_out.txt
       1056 1
```

!!! note "Which openofdm commit you get"
    `get_ip_openofdm_rx.sh` checks out the openofdm commit that openwifi-hw pins (`2bb3ad1` at the time of writing), not the tip of the `dot11zynq` branch that the links on this page point to. On the pinned commit, `openofdm_rx.tcl` rewrites `verilog/openofdm_rx_pre_def.v` each time it creates the project. On the current `dot11zynq` tip, `openofdm_rx.tcl` appends to the file instead, and only `ip/openofdm_rx/create_vivado_proj.sh` deletes it first. The generic `ip/create_vivado_proj.sh` one directory up does not. If you run the branch tip with the generic script, macros from earlier runs stay in effect. A stale `CLK_SPEED_100M`, for example, overrides a new `CLK_SPEED_240M`, because `dot11_tb` checks `CLK_SPEED_100M` first.

!!! note "The Icarus Verilog flow is legacy"
    `verilog/Makefile` and `verilog/dot11_modules.list` come from the original USRP N210 version of openofdm. The module list names files that are not on the `dot11zynq` branch, such as `usrp2/setting_reg.v`, `moving_avg.v`, and ISE 12.2 library paths. The current receiver also instantiates Vivado IP cores (`.xci`) for the FFT, the Viterbi decoder, and the dividers. `make` does not build the current `dot11_tb`, so use the Vivado simulator.

### Working in the waveform viewer

When the simulation opens, Vivado shows three panes that you use together:

- **Scope** shows the design hierarchy, starting at `dot11_tb`. The receiver is `dot11_inst`, and its submodules sit below it, for example `dot11_inst → ofdm_decoder_inst → viterbi_inst` for the Viterbi decoder.
- **Objects** lists the signals in the scope you selected.
- The **wave window** plots the signals you add. Drag them in from **Objects**, or right-click a signal and choose *Add to Wave Window*.

!!! warning "Signals added after the run have no history"
    The simulator records a signal's history only while the signal is in the wave window or logged. A signal that you add after `run all` shows nothing for the time already simulated. After you add signals, restart and run again. Alternatively, log every signal before the run:

    ```tcl
    restart
    log_wave -recursive *
    run all
    ```

    Logging every signal makes the run slower and the waveform database larger.

To reuse the same signal set in later sessions, save the wave window as a waveform configuration file with `save_wave_config dot11_tb.wcfg`. These Tcl Console commands cover most sessions:

| Command | Effect |
|---|---|
| `run all` | Run until the testbench calls `$finish` |
| `run 200 us` | Run for a fixed simulated time |
| `restart` | Return to time zero and keep the compiled design |
| `relaunch_sim` | Recompile changed sources, then restart |
| `add_wave /dot11_tb/dot11_inst/state` | Add one signal to the wave window |
| `log_wave -recursive *` | Record the history of every signal |
| `save_wave_config dot11_tb.wcfg` | Save the signals in the wave window to a `.wcfg` file |
| `close_sim -force` | Close the simulation without saving changes to the wave window |

To jump from a line in a dump file to the waveform, convert its sample index to time. Reset releases at 86 ns and one sample lasts 50 ns at 20 MSPS, so sample index *n* is at about 86 ns + *n* × 50 ns, whatever the clock speed.

### The IQ input file

The receiver expects **20 MSPS** baseband IQ. Each sample line holds two signed integers in the 16-bit range, I then Q, separated by a space. These lines are the start of the default vector, with the run of zero samples before the packet shortened:

```text
0 0 0 0 0 0 0 5220 1
0 0
0 0
1507 1507
-4340 77
-441 -2573
```

`dot11_tb` reads one sample line every 50 ns. It packs I into `sample_in[31:16]` and Q into `sample_in[15:0]`, and pulses `sample_in_strobe` for one clock cycle. It drives `rssi_half_db` to 0, so the file carries no RSSI.

#### The metadata line

The first line above is a metadata line. The testbench treats any line that does not hold exactly two numbers as metadata. It reads up to eight values from that line, then reads the next line as the sample in the same clock cycle, so a metadata line does not use up a sample slot. Metadata lines can appear anywhere in the file, and each one replaces the previous values.

| Position | Field | Used on `dot11zynq` |
|---|---|---|
| 1 to 7 | `sta_id_to_decode`, `tb_disambiguity`, `tb_pre_fec_padding_factor`, `tb_he_mcs`, `tb_ru_idx`, `tb_ru_width_i`, `tb_gi_he_ltf` | No. These are 802.11ax decoding fields that this branch's testbench reads but does not connect to the receiver |
| 8 | `Fc_in_MHz`, the carrier frequency in MHz | Yes. It drives the receiver's `Fc_in_MHz` input, which `rot_after_fft.v` uses |

The testbench ignores any values after the eighth. The default vector uses 5220 MHz.

!!! warning "Most shipped vectors have no metadata line"
    Only a metadata line sets `Fc_in_MHz`. Upstream added the line to the default vector in [commit 6d459c1](https://github.com/open-sdr/openofdm/commit/6d459c1701b4795064c3bcf63ca698944c00e5c1) because `dot11_tb` does not work without it. Without the line, the receiver still detects the preamble, but the SIGNAL check fails and `status_code.txt` gets a line instead of `fcs_out.txt`. The other vectors in `testing_inputs/` are older and lack the line. Copy the first line of the default vector to the top of any other vector or capture before you simulate it:

    ```bash
    # from the openwifi-hw root
    cd ip/openofdm_rx/testing_inputs/simulated
    head -n 1 ht_mcs7_gi1_aggr0_len14_pre100_post200_openwifi.txt > /tmp/ag_6M_len14.txt
    cat ag_6M_len14_pre100_post200_openwifi.txt >> /tmp/ag_6M_len14.txt
    ```

    A file in the older three-column `I Q RSSI` layout also fails. The testbench reads each three-number line as metadata, so it loses every other sample and never sets `Fc_in_MHz`. Strip the third column first, for example with `awk '{print $1, $2}'`.

#### Choosing the IQ file

The `` `SAMPLE_FILE `` macro in `verilog/openofdm_rx_pre_def.v` names the file. `$fopen` resolves a relative path from the simulation working directory, five levels below `ip/openofdm_rx`, which is why the default value starts with `../../../../../testing_inputs/`. Use absolute paths for your own files.

You can set the macro in three ways:

| When | How |
|---|---|
| When you create the project | Pass the path as the fifth argument, after the board name and the clock in MHz: `./create_vivado_proj.sh $XILINX_DIR openofdm_rx.tcl zed_fmcs2 100 /home/user/captures/capture.txt` |
| In an existing project | Edit the last `` `SAMPLE_FILE `` line in `verilog/openofdm_rx_pre_def.v`, then relaunch the simulation |
| From a script | Use `openofdm_rx_sim_iq_file.tcl`, described in [Automated and batch simulation](#automated-and-batch-simulation) |

The line in the macro file looks like this:

```verilog
`define SAMPLE_FILE "/home/user/captures/capture.txt"
```

`openofdm_rx_sim_iq_file.tcl` appends a new line to the macro file on every call instead of rewriting it, and so does `openofdm_rx.tcl` on the current `dot11zynq` tip. When the file defines the same macro more than once, the last definition wins.

#### Clock speed

The testbench clock comes from a `CLK_SPEED_*` macro. `openofdm_rx.tcl` writes it from the `NUM_CLK_PER_US` argument, the fourth argument to `create_vivado_proj.sh`, and accepts only 100, 200, 240, or 400. The sample rate stays at 20 MSPS at every clock, so a faster clock leaves more clock cycles between strobes: 5 at 100 MHz and 20 at 400 MHz. When you test a change that depends on the number of cycles per sample, use the baseband clock of your target board (see [Changing the baseband clock](FPGA-Development.md#changing-the-baseband-clock)).

<figure>
<svg viewBox="0 0 900 330" role="img" aria-label="The dot11_tb simulation data flow. A test vector text file of I and Q values at 20 MSPS, with a metadata line, feeds the dot11_tb harness, which packs each line into sample_in and pulses sample_in_strobe into the dot11 receiver device under test. The receiver runs sync, equalization, demod, and Viterbi. Its results go two ways: to the waveform view, where you watch state, preamble_detected, pkt_len, fcs_ok, and byte_out, and to dumped text files such as byte_out.txt, equalizer_out.txt, and fcs_out.txt, which you compare with the known frame or a reference model." style="width:100%;height:auto;max-width:1000px;font-family:inherit;font-size:13px">
  <defs>
    <marker id="sim-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor" fill-opacity="0.6"/>
    </marker>
  </defs>

  <!-- main pipeline row, y center ~150 -->
  <!-- test vector file -->
  <rect x="16" y="118" width="172" height="66" rx="10" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.3"/>
  <text x="102" y="144" text-anchor="middle" font-size="12.5" font-weight="700" fill="currentColor">test vector</text>
  <text x="102" y="161" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.75">metadata + I  Q per line</text>
  <text x="102" y="175" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.75">20 MSPS</text>

  <!-- dot11_tb harness -->
  <rect x="238" y="118" width="150" height="66" rx="10" fill="#0d9488" fill-opacity="0.06" stroke="#0d9488" stroke-opacity="0.55" stroke-width="1.4"/>
  <text x="313" y="144" text-anchor="middle" font-size="13" font-weight="700" fill="#0d9488">dot11_tb</text>
  <text x="313" y="161" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.75">packs sample_in</text>
  <text x="313" y="175" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.75">+ sample_in_strobe</text>

  <!-- dot11 DUT -->
  <rect x="438" y="112" width="196" height="78" rx="10" fill="#4f5bd5" fill-opacity="0.06" stroke="#4f5bd5" stroke-opacity="0.55" stroke-width="1.4"/>
  <text x="536" y="140" text-anchor="middle" font-size="13" font-weight="700" fill="#4f5bd5">dot11 (DUT)</text>
  <text x="536" y="158" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.78">sync · equalize</text>
  <text x="536" y="172" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.78">demod · Viterbi</text>

  <!-- pipeline arrows -->
  <g stroke="currentColor" stroke-opacity="0.6" stroke-width="1.6" fill="none">
    <line x1="188" y1="151" x2="234" y2="151" marker-end="url(#sim-arrow)"/>
    <line x1="388" y1="151" x2="434" y2="151" marker-end="url(#sim-arrow)"/>
  </g>

  <!-- outputs: waveform (top right) and dumped files (bottom right) -->
  <rect x="678" y="36" width="206" height="86" rx="10" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.3"/>
  <text x="781" y="60" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">waveform view</text>
  <text x="781" y="78" text-anchor="middle" font-size="9.5" fill="currentColor" fill-opacity="0.78">state · preamble_detected</text>
  <text x="781" y="92" text-anchor="middle" font-size="9.5" fill="currentColor" fill-opacity="0.78">pkt_len · demod_is_ongoing</text>
  <text x="781" y="106" text-anchor="middle" font-size="9.5" fill="currentColor" fill-opacity="0.78">fcs_ok · byte_out</text>

  <rect x="678" y="182" width="206" height="72" rx="10" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.3"/>
  <text x="781" y="206" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">dumped .txt files</text>
  <text x="781" y="224" text-anchor="middle" font-size="9.5" fill="currentColor" fill-opacity="0.78">byte_out.txt · fcs_out.txt</text>
  <text x="781" y="238" text-anchor="middle" font-size="9.5" fill="currentColor" fill-opacity="0.78">equalizer_out.txt · demod_out.txt</text>

  <!-- branch arrows from DUT -->
  <g stroke="currentColor" stroke-opacity="0.55" stroke-width="1.5" fill="none">
    <path d="M634,132 H656 V79 H674" marker-end="url(#sim-arrow)"/>
    <path d="M634,170 H656 V218 H674" marker-end="url(#sim-arrow)"/>
  </g>

  <!-- reference check -->
  <rect x="678" y="278" width="206" height="44" rx="10" fill="#be3d73" fill-opacity="0.06" stroke="#be3d73" stroke-opacity="0.55" stroke-width="1.4"/>
  <text x="781" y="298" text-anchor="middle" font-size="11.5" font-weight="700" fill="#be3d73">reference check</text>
  <text x="781" y="313" text-anchor="middle" font-size="9.5" fill="currentColor" fill-opacity="0.78">known frame or model output</text>
  <line x1="781" y1="254" x2="781" y2="274" stroke="currentColor" stroke-opacity="0.55" stroke-width="1.5" marker-end="url(#sim-arrow)" fill="none"/>
</svg>
<figcaption><em>The <code>dot11_tb</code> data flow. A recorded or generated IQ file drives the receiver one sample at a time. Results go two ways at once: the waveform view for interactive debugging, and dumped text files that you compare with the known frame or a reference model.</em></figcaption>
</figure>

### What to watch on the outputs

`dot11_tb` monitors the receiver's full progress. Add these signals from the `dot11_inst` scope to the wave window. Together they show how far a packet got and where it failed.

| Signal | What it means |
|---|---|
| `short_preamble_detected`, `long_preamble_detected` | Packet detection and coarse and fine timing found the preamble. If these never fire, the problem is sync or signal level, not decoding. |
| `state` | The receiver FSM position. Watch it step through detection, channel estimation, SIGNAL parsing, and payload demod. A stuck `state` localizes the fault to one stage. |
| `pkt_header_valid`, `pkt_len`, `pkt_rate` | The SIGNAL or HT-SIG field parsed and gave a length and rate. A wrong `pkt_len` here means SIGNAL decoding, not payload decoding, is off. |
| `demod_is_ongoing` | Payload demodulation is running. |
| `byte_out`, `byte_out_strobe` | The decoded bytes, one at a time. Compare against the known frame. |
| `fcs_ok`, `fcs_out_strobe` | The CRC check passed. This is the end-to-end pass or fail result for the whole receive chain. |

### Dumped text files

Alongside the waveform, the testbench writes many intermediate results to text files with `$fwrite`, so you can check them numerically rather than by eye. The files land in the simulation working directory, `openofdm_rx/openofdm_rx.sim/sim_1/behav/xsim/` below `ip/openofdm_rx`. The testbench flushes each file after every write, so you can read them while the simulation is still running.

Every file except `sample_file_name.txt` starts each line with the sample index, the number of IQ samples read so far. Use it to line up events across files, to map a line back to the input file, and to find the moment in the waveform.

| Dumped file | Values after the sample index |
|---|---|
| `sample_file_name.txt` | The `` `SAMPLE_FILE `` path that this run opened, with no sample index |
| `short_preamble_detected.txt` | None. One line each time the short preamble is detected |
| `sync_long_frame_detected.txt` | Long preamble detected: `addr1` and the LTF phase offset |
| `sync_long_out.txt` | FFT output, I and Q per subcarrier |
| `equalizer_out.txt` | Equalized I and Q per subcarrier, which is the constellation |
| `signal_out.txt`, `ht_sig_out.txt` | The L-SIG bits as a decimal number, and HT-SIG1 and HT-SIG2 |
| `demod_out.txt`, `demod_soft_bits.txt` | Demodulated bits, and the 3-bit soft values passed toward the Viterbi decoder |
| `conv_out.txt`, `descramble_out.txt` | Viterbi decoder output and descrambler output in binary, written during the payload only |
| `byte_out.txt` | One decoded byte in hex. The first bytes come from the SIGNAL and HT-SIG fields, then the MPDU follows |
| `fcs_out.txt` | `fcs_ok` for each packet |
| `phy_len.txt` | Number of OFDM symbols, and the number of bits in the last symbol |
| `status_code.txt` | Status code and receiver state. Written only when the SIGNAL or HT-SIG check fails |

The testbench writes more than 30 further files for internal stages, for example `mag_sq.txt`, `metric.txt`, `fft_in.txt`, and `cpe.txt`. Open `dot11_tb.v` to see the condition that writes each one.

To print the decoded bytes of a run on one line, for comparison with the frame you expect:

```bash
awk '{printf "%s ", $2} END {print ""}' byte_out.txt
```

For the default vector, the first 3 bytes are the L-SIG field and the next 6 are HT-SIG. The 14-byte MPDU follows, ending in its 4-byte FCS:

```console
8b 01 02 07 0e 00 86 f0 01 00 01 02 03 04 05 06 07 08 09 46 d7 6c 45
```

### Cross-checking against a reference

The openofdm repo keeps the floating-point Python decoder from the original USRP project in [`scripts/`](https://github.com/open-sdr/openofdm/tree/dot11zynq/scripts). It is `decode.py`, which uses the bundled `commpy` package for the convolutional code and the `wltrace` package for frame parsing. Treat it as a readable reference for the algorithm, not as a ready-made checker for the current testbench:

- `decode.py` reads raw binary files of interleaved 16-bit I and Q, such as the `.dat` files in `testing_inputs/`, not the text vectors. Parts of it still use Python 2 syntax.
- `test.py`, which compares the Python results with simulation dumps, is Python 2. It drives the legacy Icarus Verilog flow and expects the old dump layout without the sample index.
- The decoder works in floating point, so you can compare only the decoded fields and bytes with the hardware. The fixed-point intermediate values differ.

For day-to-day checks, compare `byte_out.txt` with the frame you know is in the vector, and check `fcs_out.txt`. A stage-by-stage comparison of the intermediate dumps needs a fixed-point model of the receiver.

### The test vectors

Sample IQ files live in [`openofdm/testing_inputs/`](https://github.com/open-sdr/openofdm/tree/dot11zynq/testing_inputs), grouped by how they were produced. Pick the group that matches what you are testing.

| Directory | Origin | Use it to |
|---|---|---|
| `simulated/` | Generated with an ideal (no-noise) channel: `ag_*.txt` (11a/g), `ht_mcs*_gi*.txt` (11n), `iq_*.txt` | Verify decoding logic against a clean, known-good signal |
| `conducted/` | Captured with a USRP N210 over a cable (`dot11a_*`, `dot11n_*` at each rate) | Test against a real but low-distortion signal |
| `radiated/` | Captured over the air, with `.pcap` companions | Test sync and equalization against real multipath and noise |

Only files whose names end in `_openwifi.txt` use the `dot11_tb` format. In `conducted/` and `radiated/`, the `.dat` and plain `.txt` files with the same base name are in the original USRP formats. `decode.py` reads the `.dat` files. Remember to add a [metadata line](#the-metadata-line) to any vector other than the default one.

File names encode the format and rate, for example `dot11n_6.5mbps` or `ht_mcs7_gi1`. In `simulated/`, `len14` is the payload length in bytes, and `pre100_post200` gives the number of zero samples before and after the packet. Start from a `simulated/` file at a low MCS when you bring up a change, then move to `conducted/` and `radiated/` to stress synchronization and the equalizer. The `simulated/iq_11n_mcs7_gi0_100B_*` files include versions named `wrong_sig`, `wrong_ht_sig`, and `ht_unsupport`, which you can use to exercise the receiver's error paths.

The repo ships no generator for a fresh `simulated/` vector. To make your own vector, convert the output of the [transmitter testbench](#the-transmitter-testbench-dot11_tx_tb), or [capture IQ on a board](#replaying-a-hardware-capture).

### Troubleshooting a run

| Symptom | Likely cause | What to check |
|---|---|---|
| The run stops at 1 µs | The project's default run time is 1000 ns | Press **Run All** |
| Elaboration fails with `Module <viterbi_v7_0> not found` | No valid Viterbi Decoder license, so the IP is locked | [Before you start](#before-you-start) |
| The Tcl Console repeats `File descriptor (0) passed to $fgets is not valid`, and every dump file stays empty | `$fopen` could not open the IQ file | The path in `sample_file_name.txt`. Use an absolute path |
| A vector other than the default detects the preamble, then `status_code.txt` gets a line | The file has no metadata line, so `Fc_in_MHz` is undefined | [The metadata line](#the-metadata-line) |
| `short_preamble_detected.txt` stays empty | No packet detected, because of signal level or a sample rate other than 20 MSPS | Plot the IQ file and compare its amplitude with a shipped vector |
| The preamble is found, and `status_code.txt` has lines | The SIGNAL or HT-SIG field failed its check | `signal_out.txt`, `ht_sig_out.txt`, `equalizer_out.txt` |
| `fcs_out.txt` ends in `0` | A payload decoding error | Work back from `byte_out.txt` through `conv_out.txt`, `demod_out.txt`, and `equalizer_out.txt` |
| A macro change has no effect | An older definition in the macro file still applies | The whole of `verilog/openofdm_rx_pre_def.v` |
| A newly added signal shows no waveform | It was added after the run | Restart and run again, or use `log_wave` before the run |

## Automated and batch simulation

For regression-style runs you do not need to work in the waveform viewer. The openofdm repo has three helper Tcl scripts at its root, which is `ip/openofdm_rx/` in openwifi-hw:

| Script | What it does |
|---|---|
| [`openofdm_rx_sim_iq_file.tcl`](https://github.com/open-sdr/openofdm/blob/dot11zynq/openofdm_rx_sim_iq_file.tcl) | Runs `dot11_tb` against one IQ file passed in `argv` |
| [`openofdm_rx_sim_iq_file_batch.tcl`](https://github.com/open-sdr/openofdm/blob/dot11zynq/openofdm_rx_sim_iq_file_batch.tcl) | Runs the single-file script for each file in a list that you edit into the script |
| [`openofdm_rx_side_ch_sim_ultra_scale.tcl`](https://github.com/open-sdr/openofdm/blob/dot11zynq/openofdm_rx_side_ch_sim_ultra_scale.tcl) | Simulates the receiver together with `side_ch` on UltraScale parts |

`openofdm_rx_sim_iq_file.tcl` shows the pattern. It appends the chosen file to the macro file as a new `` `SAMPLE_FILE `` line. It sets the run length from the number of lines in the file, `lines / 20 + 1` microseconds with Tcl integer division, because 20 lines last one microsecond at 20 MSPS. It then calls `relaunch_sim` and `run`, and copies every dumped `.txt` file into a results directory. That directory is the input path without `.txt`, so it sits next to the input file. Because each input keeps its own set of dumps, batch runs stay comparable.

The script uses paths relative to `ip/openofdm_rx` and expects a simulation that has already launched once. In the Tcl Console of the open project:

```tcl
pwd
set argv [list /home/user/captures/capture.txt]
source openofdm_rx_sim_iq_file.tcl
```

`pwd` must print the `ip/openofdm_rx` directory, which it does when you start Vivado through `create_vivado_proj.sh` there. Pass an absolute path.

!!! warning "The results directory is replaced on every run"
    The script runs `rm -rf` on the results directory before it copies the new dumps. For `/home/user/captures/capture.txt`, that is `/home/user/captures/capture/`. Keep nothing else in it.

For a batch, edit the `iq_file_set` list near the top of `openofdm_rx_sim_iq_file_batch.tcl`, because the committed list holds paths from the upstream author's machine. A `glob` pattern also works:

```tcl
set iq_file_set [list \
    /home/user/captures/capture_a.txt \
    /home/user/captures/capture_b.txt \
]
# or every vector in a directory:
# set iq_file_set [glob /home/user/captures/*.txt]
```

The batch script first checks that every file has at least 480 lines, and stops before simulating anything if one is shorter. Each run appends one more `` `SAMPLE_FILE `` line to the macro file. The last line wins, so this does no harm during the batch, but remove the extra lines before you go back to interactive work.

To run without the Vivado window, put the same steps in your own wrapper script. This wrapper is an example and is not part of the repo:

```tcl
# run_one.tcl, in ip/openofdm_rx
open_project openofdm_rx/openofdm_rx.xpr
launch_simulation
set argv [list /home/user/captures/capture.txt]
source openofdm_rx_sim_iq_file.tcl
close_sim
```

```bash
# from the openwifi-hw root
cd ip/openofdm_rx
source $XILINX_DIR/Vivado/2022.2/settings64.sh
vivado -mode batch -source run_one.tcl
```

## The transmitter testbench (`dot11_tx_tb`)

The transmit side has its own testbench, [`dot11_tx_tb.v`](https://github.com/open-sdr/openwifi-hw/tree/master/ip/openofdm_tx/src), which drives `openofdm_tx` from a memory image instead of an IQ file. The test vectors are `.mem` files under [`ip/openofdm_tx/unit_test/test_vec/`](https://github.com/open-sdr/openwifi-hw/tree/master/ip/openofdm_tx/unit_test/test_vec), named for the frame they encode:

- `tx_intf.mem`: the base TX interface memory image.
- `ht_tx_intf_mem_mcs7_gi1_aggr0_byte100.mem` and `..._byte8176.mem`: 802.11n HT frames at MCS7, short guard interval, for a 100-byte and an 8176-byte payload.

The testbench loads one of them with `$readmemh`. The other two `$readmemh` lines are commented out, and the 8176-byte frame is active as committed. To change the vector, move the comment markers in `dot11_tx_tb.v`. The paths are relative to the simulation working directory, like the receiver's default vector.

Simulate it the same way as the receiver:

```bash
# from the openwifi-hw root
cd ip/openofdm_tx
../create_vivado_proj.sh $XILINX_DIR openofdm_tx.tcl
```

The project lands in `ip/openofdm_tx/openofdm_tx/`, and `dot11_tx_tb` is already the simulation top. Run behavioral simulation, then **Run All**. The testbench runs a 200 MHz clock and ties `result_iq_ready` high. It writes one `I Q` line to `dot11_tx.txt` for every valid output sample, and calls `$finish` when `phy_tx_done` rises. Because the ready signal is always high, the file holds the consecutive baseband samples of the frame, not a stream paced at 20 MSPS. For the committed 8176-byte frame, the run ends at about 479 µs with 18864 lines in `dot11_tx.txt`. The testbench also dumps every signal to `dot11_tx.vcd` in the same directory.

The lines of `dot11_tx.txt` are already in the receiver's two-column format. To replay the frame through `dot11_tb`, add a metadata line and some idle samples around the packet. The shipped receiver vectors use 100 zero samples before the packet and 200 after:

```bash
# from the openwifi-hw root
TX_OUT=ip/openofdm_tx/openofdm_tx/openofdm_tx.sim/sim_1/behav/xsim/dot11_tx.txt
RX_VEC=ip/openofdm_rx/testing_inputs/simulated/ht_mcs7_gi1_aggr0_len14_pre100_post200_openwifi.txt
head -n 1 "$RX_VEC" > /tmp/tx_loopback.txt
yes '0 0' | head -n 100 >> /tmp/tx_loopback.txt
cat "$TX_OUT" >> /tmp/tx_loopback.txt
yes '0 0' | head -n 200 >> /tmp/tx_loopback.txt
```

Point `` `SAMPLE_FILE `` at `/tmp/tx_loopback.txt` and run `dot11_tb`. A line ending in `1` in `fcs_out.txt` shows that the transmitter and the receiver agree on the frame. For the 8176-byte frame, `byte_out.txt` then holds 8185 lines: 9 for the SIGNAL and HT-SIG fields, then the frame. This is the [self-loopback test](Research-Features.md#self-loopback-testing) you run on hardware, done entirely in simulation.

## Block-level unit tests

A few submodules have their own tiny testbench so you can verify them without building a full core. Each lives in `ip/<core>/unit_test/<block>/` with a `<block>_tb.v` and a `<block>_tb.tcl`. The Tcl script builds a standalone Vivado project (targeting the ZCU102 part `xczu9eg-ffvb1156-2-e`) that contains only that block and its testbench, with a short preset run time.

| Unit test | Block under test | Stimulus |
|---|---|---|
| [`ip/rx_intf/unit_test/adc_intf`](https://github.com/open-sdr/openwifi-hw/tree/master/ip/rx_intf/unit_test/adc_intf) | `adc_intf.v`, the ADC-side sample unpacker | Generated inside `adc_intf_tb.v` |
| [`ip/xpu/unit_test/mv_avg`](https://github.com/open-sdr/openwifi-hw/tree/master/ip/xpu/unit_test/mv_avg) | `mv_avg.v` / `mv_avg_dual_ch.v`, the RSSI moving-average filter | `test_vec/data_in.txt`, with `test_data_in_out.m` as the MATLAB reference |
| [`ip/xpu/unit_test/fifo_sample_delay`](https://github.com/open-sdr/openwifi-hw/tree/master/ip/xpu/unit_test/fifo_sample_delay) | `fifo_sample_delay.v`, the sample-delay FIFO | Generated inside `fifo_sample_delay_tb.v` |

To run one, source its `.tcl` to create the project, then open it and run behavioral simulation:

```bash
cd ip/xpu/unit_test/mv_avg
vivado -mode batch -source mv_avg_tb.tcl
# the batch run only creates the ./mv_avg_tb project, it does not simulate
# open ./mv_avg_tb in the Vivado GUI and Run Behavioral Simulation
```

The `mv_avg` test shows the file-vector pattern in one block. `test_data_in_out.m` generates `data_in.txt` and the expected output in MATLAB. The testbench reads `data_in.txt`, and you compare its Verilog result with the MATLAB reference. The full `dot11_tb` uses the same read, dump, and compare loop across the receiver.

## Conditional compilation in simulation

`create_vivado_proj.sh` passes extra arguments through to `` `define `` macros in `<ip_name>_pre_def.v`, the same mechanism the full build uses. In simulation these macros select the sample file, the clock speed, and debug blocks. See [FPGA Development → conditional compilation](FPGA-Development.md#conditional-compilation-with-verilog-macros) for the argument order, and remember to pass the *same* macros to `create_ip_repo.sh` when you later build the top-level project, so the synthesized core matches what you simulated.

## From simulation to hardware

Simulation and on-board debugging cover different failures. Use the testbench to verify logic and datapath correctness against known vectors, where you have full visibility and a golden reference. Use the Xilinx [ILA](FPGA-Development.md#debugging-on-hardware) on the running board to examine real RF, AD9361 timing, and interactions between the FPGA and Linux driver. To reproduce a hardware bug in simulation, capture the offending IQ on the board and replay it through the receiver testbench.

### Replaying a hardware capture

The upstream scripts in [`user_space/side_ch_ctl_src/`](https://github.com/open-sdr/openwifi/tree/master/user_space/side_ch_ctl_src) turn a `side_ch` IQ capture into a `dot11_tb` input file.

1. Capture IQ received off the air, as described in [IQ capture](Research-Features.md#iq-capture). Pick a trigger condition that fires on the packet you care about. On the PC, `iq_capture.py` writes every capture to `iq.txt`.
2. In MATLAB, in `openwifi/user_space/side_ch_ctl_src`, split the file into captures and write the one you want as `I Q` lines. This example uses an `iq_len` of 8187 and capture number 5:

    ```matlab
    test_iq_file_display(8187, 'iq.txt');
    save_iq_to_txt_for_verilog_sim('iq_8187.mat', 5);
    ```

    `test_iq_file_display` saves the captures to `iq_<iq_len>.mat` as the variable `iq_capture`, one column per capture, and plots them so you can pick one. `save_iq_to_txt_for_verilog_sim` writes the selected captures to a text file named after the variable, `iq_capture.txt`. If you pass several capture numbers, their samples are joined in one file. An optional third argument `[sp ep]` keeps only samples `sp` to `ep` of each capture.

3. Add a [metadata line](#the-metadata-line) at the top of `iq_capture.txt`, with `Fc_in_MHz` set to the frequency you captured on, for example 2462 for channel 11.
4. Point `` `SAMPLE_FILE `` at the file with an absolute path, and run `dot11_tb`.

The conversion script does not change the sample rate, and the capture includes the samples from `pre_trigger_len` before the trigger. Set `pre_trigger_len` large enough that the capture starts before the packet's preamble. Otherwise the receiver cannot detect the packet.
