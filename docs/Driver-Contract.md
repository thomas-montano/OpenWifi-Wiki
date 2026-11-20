---
description: 'What the openwifi Linux driver must provide to mac80211 and to the rest of openwifi: capability flags, required callbacks, frame ownership rules, and the layouts it shares with the FPGA, sdrctl, sysfs, and the device tree.'
---

# The Driver Contract

This page lists what Linux and the rest of the openwifi stack expect from the openwifi driver. [The Linux Driver](Driver-Architecture.md) explains how the driver works. Read this page before you change the driver, and check your change against it afterwards. Each section names a rule, the code in [`driver/sdr.c`](https://github.com/open-sdr/openwifi/blob/master/driver/sdr.c) that follows it, and what goes wrong when the driver breaks it. The page also points out where the current driver does not follow a rule.

A broken rule rarely crashes the kernel. Instead, it shows up as a client that drops off after a minute, a rate that never climbs, or an `iw` command that reports success and changes nothing. The symptom usually appears far from the change that caused it.

!!! info "Sources for this page"
    The driver behavior described here is from the `master` branch of [open-sdr/openwifi](https://github.com/open-sdr/openwifi) as of November 2026. The `mac80211` rules come from [`include/net/mac80211.h`](https://github.com/torvalds/linux/blob/v6.12/include/net/mac80211.h) and [`net/mac80211/main.c`](https://github.com/torvalds/linux/blob/v6.12/net/mac80211/main.c) in Linux 6.12, the kernel listed in [Versions this wiki targets](Repositories.md#versions-this-wiki-targets). When the code and this page disagree, the code is right.

## Who does what

openwifi is a SoftMAC driver. `mac80211` runs the 802.11 management state machine and makes most decisions. The driver and the FPGA carry out the time-critical parts. The split tells you which side has to change when you add a feature.

| Task | Done by | Notes |
|---|---|---|
| Authentication, association, and other MLME work | `mac80211` | The same as for any SoftMAC driver. |
| Scanning | `mac80211` | There is no `hw_scan` callback. `mac80211` scans by calling `config` with each channel in turn. |
| Rate selection | `mac80211` (`minstrel_ht`) | The driver reads the chosen rate with `ieee80211_get_tx_rate()`. A rate forced through `sdrctl` overrides it (see the warning below). |
| Encryption and decryption | `mac80211`, in software | There is no `set_key` callback, so CCMP runs on the ARM cores. See [hostapd & wpa_supplicant](hostapd-and-wpa_supplicant.md). |
| Station tracking | `mac80211` | There is no `sta_add` or `sta_state` callback. |
| Sequence numbers | Driver | Only for frames that carry `IEEE80211_TX_CTL_ASSIGN_SEQ`, from the counter `priv->seqno`. |
| Duration field of HT frames | Driver | `gen_ht_duration_id()` writes it, because `mac80211` computes it only for legacy rates. |
| Beacon timing | Driver, in software | A delayed work item. See [Beacons](#beacons). |
| CSMA/CA, ACK, retransmission, TSF | FPGA (`xpu`) | The driver configures them through registers. |
| Frame filtering | FPGA (`xpu`) | Configured by `configure_filter` and `bss_info_changed`. |

!!! warning "A forced rate is invisible to rate control"
    When you force a data rate with the `drv_tx` registers (see [TX rate and MCS override](sdrctl-and-Runtime-Control.md#tx-rate-and-mcs-override)), `openwifi_tx()` sends at the forced rate. The TX status it reports still names the rate `mac80211` chose, as a TODO in the source notes. `minstrel_ht` then records successes and failures against a rate that was never used. Clear the forced rate before you measure rate-control behavior.

    The driver also forces one rate itself. An FPGA bug makes the TX core hang on aggregated frames at HT MCS 0, so `openwifi_tx()` sends those frames at MCS 1, and the TX status still reports MCS 0.

## Capabilities declared at probe time

`openwifi_dev_probe()` describes the device to `mac80211` before it calls `ieee80211_register_hw()`. `mac80211` and `cfg80211` plan around that description for as long as the driver is loaded, and `iw list` prints it. Each flag and field states something about the driver, and code elsewhere in the driver has to make it true.

### Hardware flags

| Flag | Meaning | Implemented by | If it is not true |
|---|---|---|---|
| `RX_INCLUDES_FCS` | Every received frame ends with its 4-byte FCS. | `openwifi_rx_interrupt()`, which copies the frame together with its FCS. | `mac80211` still cuts 4 bytes from the end of every frame. Remove the FCS without clearing the flag and every frame loses 4 bytes of content. |
| `SIGNAL_DBM` | `rx_status.signal` is in dBm. | `openwifi_rx_interrupt()`, which converts `rssi_half_db` with the per-band `rssi_correction`. | Signal values in `iw dev sdr0 station dump` and in scan results are wrong, and RSSI threshold events fire at the wrong level. |
| `REPORTS_TX_ACK_STATUS` | Every TX status says correctly whether the frame was acknowledged. | `openwifi_tx_interrupt()`, which sets `IEEE80211_TX_STAT_ACK` from the ACK bitmap the FPGA returns. | Stations disconnect, and an AP can drop its clients or fail to associate them. See [What mac80211 does with the ACK status](#what-mac80211-does-with-the-ack-status). |
| `BEACON_TX_STATUS` | Beacons get a TX status like any other frame. | Beacons go through `openwifi_tx()` and come back through the TX interrupt. | With this flag set, `mac80211` copies beacons to monitor interfaces only from the TX status. Monitor captures lose the board's own beacons. |
| `AP_LINK_PS` | In AP mode, the driver detects when each client sleeps and reports it with `ieee80211_sta_ps_transition()`. | Nothing. The driver never calls that function. | See the warning below. |
| `AMPDU_AGGREGATION` | The driver handles `ampdu_action` and sends A-MPDUs. Set only when `test_mode` bit 0 is set. | `openwifi_ampdu_action()` and `tx_intf`. | `mac80211` sets up aggregation sessions that the hardware cannot serve. See [Turning on A-MPDU aggregation](Wi-Fi-4-and-Wi-Fi-6.md#turning-on-a-mpdu-aggregation). |

!!! warning "Clients in power save mode are not handled in AP mode"
    `AP_LINK_PS` tells `mac80211` to ignore the power management bit in incoming frames, because the flag says the driver reports sleeping clients itself. openwifi sets the flag but never calls `ieee80211_sta_ps_transition()`. As a result, no layer marks a client as asleep, and `mac80211` never buffers frames for one. A client in power save mode can miss frames the AP sends while it sleeps. Turn off power save on clients when you test (see [Getting the best throughput](Link-Testing-with-iperf.md#getting-the-best-throughput)). To support power save, either call `ieee80211_sta_ps_transition()` from the RX path or clear the flag so that `mac80211` reads the bit itself.

### What mac80211 does with the ACK status

`REPORTS_TX_ACK_STATUS` turns the ACK bit of each TX status into an input for connection management. In Linux 6.12, `mac80211` relies on it in these places:

- **Connection monitoring in station mode.** To check that the AP is still there, `mac80211` sends a null data frame and waits for its ACK status. Without the flag it would send a probe request instead. If no ACK is reported, the station concludes that the AP is gone and disconnects.
- **Authentication and association in station mode.** `mac80211` times its authentication and association retries from the TX status of each request.
- **Association in AP mode.** `mac80211` passes the TX status of each association response to `hostapd`. If the client did not acknowledge the response, `hostapd` removes the client from the driver. Current `hostapd` can still complete the association later, if the client sends a data frame.
- **Lost clients in AP mode.** For each client, `mac80211` counts frames that were not acknowledged. After 50 lost frames in a row and no ACK for one second, it sends a packet-loss event to user space. `hostapd` disconnects the client on that event when `disassoc_low_ack=1` is set in its configuration.
- **Rate control.** `minstrel_ht` reads the ACK bit and the attempt count of every frame to choose the next rate.

The code in the TX interrupt that computes `tx_fail` is therefore part of the contract. Frames the driver drops before they reach the air are also reported as not acknowledged (see [Transmit](#transmit)), so they count toward the loss limit too.

### Other capability fields

| Field | Value | Meaning |
|---|---|---|
| `queues` | `MAX_NUM_HW_QUEUE` (4) | `skb_get_queue_mapping()` returns 0 to 3, and the driver stops and wakes queues by those numbers. A frame with a higher number is dropped and reported as lost. |
| `max_rates` | 1 | Only `rates[0]` carries a rate. The driver ends every status rate list with `rates[1].idx = -1`. |
| `extra_tx_headroom` | `LEN_MPDU_DELIM` (4 bytes) | `mac80211` leaves room in front of each frame for the A-MPDU delimiter. `openwifi_tx()` still reallocates the `skb` if the headroom is short. |
| `interface_modes`, `iface_combinations` | See [Interfaces](#interfaces) | The interface types `cfg80211` may create, and how many at once. |
| `available_antennas_tx`, `available_antennas_rx` | 3, meaning both antennas | `set_antenna` accepts these masks. For RX it accepts only one antenna at a time. |
| `bands` | 2.4 and 5 GHz | The 8 OFDM rates and HT MCS 0 to 7 at 20 MHz. Short GI is advertised only when `test_mode` bit 1 is set (see [Short guard interval](Wi-Fi-4-and-Wi-Fi-6.md#short-guard-interval)). Both rate tables also list the four 802.11b rates, which the PHY cannot send (see [About 802.11b](Operating-Modes.md#about-80211b)). |
| Regulatory domain | Custom domain `99`, applied with `REGULATORY_STRICT_REG` and `REGULATORY_CUSTOM_REG` | 2402 to 2494 MHz with CCK disabled, and 5150 to 5875 MHz, each at up to 20 dBm. Channels outside these ranges are disabled. |
| `perm_addr` | `66:55:44:33:22:xx`, last byte random from 1 to 250 | The MAC address an interface gets unless you set another one. |
| Extended feature | `NL80211_EXT_FEATURE_CQM_RSSI_LIST` | `wpa_supplicant` can register several RSSI thresholds. The thresholds are only meaningful while `SIGNAL_DBM` holds. |
| `radar_detect_widths` in `iface_combinations` | 20 MHz (HT and non-HT), 40 MHz, and 80 MHz | The driver can detect radar at these channel widths. Nothing implements this (see the warning below). |

!!! warning "Radar channels are advertised without radar detection"
    The 5 GHz channel table in `driver/sdr.h` flags channels 52 to 64 with `IEEE80211_CHAN_RADAR`, and `radar_detect_widths` tells `cfg80211` that the driver can detect radar there. `hostapd` can therefore start an AP on these channels after a CAC. openwifi has no radar detection and never calls `ieee80211_radar_detected()`, so the CAC always passes and the AP stays on the channel when radar appears. Do not run an AP on channels 52 to 64 where DFS rules apply.

## Callbacks

`mac80211` refuses to create the device when a required callback is missing. In Linux 6.12, `ieee80211_alloc_hw_nm()` requires `tx`, `wake_tx_queue`, `start`, `stop`, `add_interface`, `remove_interface`, `config`, and `configure_filter`. It also requires channel-context callbacks. A driver that does not manage channel contexts itself must use all three of `mac80211`'s emulation helpers. The "Context" column gives the rule from the comment above `struct ieee80211_ops` in `mac80211.h`.

| Callback | Required | Context | What openwifi does |
|---|---|---|---|
| `tx` | Yes | Must be atomic | Builds the per-frame FPGA configuration and starts a DMA transfer into one of the four hardware queues. See [Transmit](#transmit). |
| `wake_tx_queue` | Yes | Not stated | Uses `mac80211`'s own `ieee80211_handle_wake_tx_queue()`, which pulls frames from the `mac80211` queues and calls `tx`. |
| `add_chanctx`, `remove_chanctx`, `change_chanctx` | Yes, as a set | Can sleep | Uses the `ieee80211_emulate_*_chanctx` helpers, which turn channel-context changes into `config` calls. |
| `switch_vif_chanctx` | No | Can sleep | Uses `ieee80211_emulate_switch_vif_chanctx`. |
| `start` | Yes | Can sleep | Initializes the five cores, writes the permanent MAC address into the `xpu`, claims both DMA channels and both interrupts, and turns the radio on through `set_antenna`. `mac80211` asks that a started device have no MAC address until an interface is added, so that it acknowledges no frames before then. If a step fails, `start` frees the rings but keeps any DMA channel or interrupt it already claimed, and returns -1 instead of the original error code. |
| `stop` | Yes | Can sleep | Mutes the transmitter, disables both interrupts, frees the rings, and releases the DMA channels and interrupts. |
| `add_interface` | Yes | Can sleep | Accepts station, AP, ad-hoc, monitor, and mesh point. Writes the interface's MAC address into the `xpu`. See [Interfaces](#interfaces). |
| `remove_interface` | Yes | Can sleep | Frees the interface slot. Leaves the MAC address in the `xpu`, although `mac80211` asks drivers to clear it when the last interface goes away. |
| `config` | Yes | Can sleep | Tunes the radio to the new channel on `IEEE80211_CONF_CHANGE_CHANNEL`. When the `restrict_freq_mhz` sysfs value is set, it tunes to that frequency instead. Ignores every other change. |
| `configure_filter` | Yes | Can sleep | Writes the filter flags to `XPU_REG_FILTER_FLAG`. See [Frame filtering](#frame-filtering). |
| `prepare_multicast` | No | Must be atomic | Returns the length of the multicast list. There is no hardware multicast filter. |
| `bss_info_changed` | No | Can sleep | Writes the BSSID to the `xpu` filter and the short-slot setting to the `xpu`. Starts and stops the [beacon work item](#beacons). Prints all other changes. |
| `conf_tx` | No | Can sleep | Writes CWmin and CWmax for one queue into `XPU_REG_CSMA_CFG`. |
| `ampdu_action` | No | Can sleep | Accepts TX sessions at once and programs `tx_intf`. Accepts RX sessions and does nothing. Returns `-EOPNOTSUPP` when aggregation is off. |
| `set_antenna`, `get_antenna` | No | Not stated | Selects TX antennas (mask 1 to 3) and one RX antenna (mask 1 or 2) on the AD9361, in `tx_intf`, and in `rx_intf`. Rejects an RX mask of 3 with `-EINVAL`, which `mac80211` allows. |
| `get_tsf`, `set_tsf`, `reset_tsf` | No | Can sleep | Read, load, or zero the 64-bit TSF in the `xpu`. |
| `set_rts_threshold` | No | Can sleep | Returns 0 and does nothing. |
| `rfkill_poll` | No | Can sleep | Reports the radio as switched off when the AD9361 TX attenuation is at least 89.75 dB (`AD9361_RADIO_OFF_TX_ATT`). |
| `testmode_cmd` | No | Can sleep | Handles `sdrctl` commands. See [User space](#user-space). |

`ampdu_action` must also tell `mac80211` when a TX aggregation session changes state:

- Answer every `IEEE80211_AMPDU_TX_START` with `ieee80211_start_tx_ba_cb_irqsafe()`, or by returning `IEEE80211_AMPDU_TX_START_IMMEDIATE`. Otherwise the session never starts.
- After `IEEE80211_AMPDU_TX_STOP_CONT`, send the frames still queued for the session without aggregation, then call `ieee80211_stop_tx_ba_cb_irqsafe()`. Otherwise the session never ends.
- After `IEEE80211_AMPDU_TX_STOP_FLUSH`, no callback is needed, because `mac80211` is removing the station. `IEEE80211_AMPDU_TX_STOP_FLUSH_CONT` comes when the station is removed before the driver has finished an earlier stop, and the driver should drop the frames it still holds.

openwifi calls `ieee80211_start_tx_ba_cb_irqsafe()` and `ieee80211_stop_tx_ba_cb_irqsafe()` directly from `openwifi_ampdu_action()`. It calls the stop callback for all three stop actions, without waiting for queued frames.

### Frame filtering

`configure_filter` must clear the bits it cannot honor from `*total_flags`, because that is how `mac80211` learns what the hardware filters. openwifi keeps only `SDR_SUPPORTED_FILTERS` (`FIF_ALLMULTI`, `FIF_BCN_PRBRESP_PROMISC`, `FIF_CONTROL`, `FIF_OTHER_BSS`, `FIF_PSPOLL`, and `FIF_PROBE_REQ`). It always adds `FIF_ALLMULTI`, since there is no multicast filter. When `FIF_BCN_PRBRESP_PROMISC`, `FIF_CONTROL`, `FIF_OTHER_BSS`, and `FIF_PSPOLL` are all set, the driver treats the request as monitor mode and passes every frame up. The `rx_monitor_all` sysfs value forces the same mode.

### Requests openwifi accepts and ignores

Several requests succeed from the point of view of Linux but change nothing in the hardware. Check this list before you debug a setting that seems to have no effect.

- **TX power.** `iw dev sdr0 set txpower` reaches the driver through `bss_info_changed` and `config`, and neither changes the AD9361. Set the attenuation with `sdrctl` instead (see [TX power and attenuation](sdrctl-and-Runtime-Control.md#tx-power-and-attenuation)).
- **RTS threshold.** `set_rts_threshold` returns success and does nothing. When `mac80211` asks for RTS/CTS on a frame, `openwifi_tx()` prints a warning and sends the frame without it. CTS-to-self protection does work.
- **AIFS and TXOP.** `conf_tx` uses only CWmin and CWmax. When the `cw_max_min_cfg` sysfs value is not zero, it replaces the values from `mac80211` for all four queues.
- **Other `config` changes.** `config` acts only on channel changes. Changes to power save, retry limits, and the other `IEEE80211_CONF_CHANGE_*` bits are ignored. The per-frame retry limit from `mac80211` still applies, through `rates[0].count`.
- **Some `bss_info_changed` changes.** Basic rates, ERP CTS protection, and the beacon interval are only printed. ERP protection still works, because `mac80211` also sets `IEEE80211_TX_RC_USE_CTS_PROTECT` on each frame that needs it. A new beacon interval also takes effect, because the beacon work item reads `beacon_int` on every run.
- **RX aggregation sessions.** `ampdu_action` accepts `IEEE80211_AMPDU_RX_START` and `IEEE80211_AMPDU_RX_STOP` without doing anything. The receiver handles A-MPDUs without per-session state.
- **TX aggregation size.** `IEEE80211_AMPDU_TX_OPERATIONAL` programs a buffer size of 4, whatever `buf_size` the peer agreed to. `mac80211` forbids aggregates with more subframes than `buf_size`, so a peer that agrees to fewer than 4 receives larger aggregates than it allowed.

## Frame ownership

### Transmit

`mac80211` hands each frame to `openwifi_tx()` as an `skb`. From then until the driver reports its status, the driver owns the `skb`. These rules keep that ownership correct:

1. **Never sleep in `tx`.** `mac80211` requires `tx` to be atomic, and `ieee80211_handle_wake_tx_queue()` calls it while holding a spinlock. Allocate with `GFP_ATOMIC`, and do not take a mutex or call `msleep()` on this path. openwifi breaks this rule in its padding code. When `skb_tailroom()` is too small for the DMA padding, `openwifi_tx()` copies the frame with `skb_copy_expand(..., GFP_KERNEL)`, which can sleep.
2. **Return every frame exactly once.** Every `skb` that enters `openwifi_tx()` goes back to `mac80211` through `ieee80211_tx_status_irqsafe()`. Normally `openwifi_tx_interrupt()` does this. A frame the driver drops goes back through `report_pkt_loss_due_to_driver_drop()`, which reports it as sent once without an ACK. Do not free a TX `skb` yourself. A frame that never comes back leaks memory, and `mac80211` code that waits for its status waits until it times out. A frame reported twice is a use-after-free. If you replace the `skb` (as the padding and headroom code does with `skb_copy_expand()` and `skb_realloc_headroom()`), free the old one, report the new one, and update every pointer into the old data. The A-MPDU padding code misses that last step. It takes `dma_buf` from the old `skb` before the copy and keeps using it afterwards, so the MPDU CRC is written to freed memory and the DMA transfer reads from it.
3. **Use one status function.** `mac80211` does not allow `ieee80211_tx_status_irqsafe()`, `ieee80211_tx_status_skb()`, and `ieee80211_tx_status_ni()` to be mixed on one device. openwifi uses only the `_irqsafe` form.
4. **Fill the status the same way every time.** Before you call `ieee80211_tx_status_irqsafe()`:
    - Call `ieee80211_tx_info_clear_status()`.
    - Set `IEEE80211_TX_STAT_ACK` only when the frame was acknowledged.
    - Set `status.rates[0].count` to the number of attempts (`nof_retx + 1`) and `status.rates[1].idx` to -1, because `max_rates` is 1.
    - For an A-MPDU subframe, set `IEEE80211_TX_STAT_AMPDU`, set `ampdu_len` to 1, and set `ampdu_ack_len` from the block ACK bitmap. Remove the 4-byte MPDU delimiter with `skb_pull()`, because `openwifi_tx()` added it and `mac80211` expects the frame to start at the 802.11 header.
5. **Stop and wake by Linux queue number.** `ieee80211_stop_queue()` and `ieee80211_wake_queue()` take the `mac80211` queue number, which is `prio` from `skb_get_queue_mapping()`. It can differ from the driver ring and the FPGA queue, because [time slicing](sdrctl-and-Runtime-Control.md#time-slicing-network-slicing) can send a priority to another ring. `ring->stop_flag` records which Linux queue stopped a ring, and the TX interrupt wakes that queue once the FPGA has room again (`RING_ROOM_THRESHOLD`). Every stop needs a matching wake, or that access category stays silent. Never call `netif_stop_queue()`, which `mac80211` forbids.

The driver also has a recovery path for a ring that seems stuck. When `openwifi_tx()` finds the next descriptor still occupied but a free one further along the ring, it reports the frames in between as lost and wakes the stopped queue, because their TX interrupt never arrives.

### Beacons

openwifi has no hardware beacon timer. When `bss_info_changed` reports `BSS_CHANGED_BEACON_ENABLED` or `BSS_CHANGED_BEACON`, the driver cancels and reschedules a delayed work item, `openwifi_beacon_work()`. Each run takes a fresh beacon from `ieee80211_beacon_get()`, writes the current TSF into its timestamp field, and sends it through `openwifi_tx()` on queue 0. The work item then reschedules itself after `beacon_int` times 1024 microseconds, and it skips a beacon when queue 0 is stopped. Beacon timing therefore depends on when the kernel runs the work item.

The work item lives in the interface's private data, so it must stop before the interface goes away. Neither `stop` nor `remove_interface` cancels it. The only cancel is in `bss_info_changed`, when `mac80211` turns beaconing off, which happens before an AP, ad-hoc, or mesh interface goes down. If you add a work item of your own, cancel it in `remove_interface` or `stop`.

### Receive

`openwifi_rx_interrupt()` builds one `struct ieee80211_rx_status` per frame and passes the frame to `ieee80211_rx_irqsafe()`. Like the TX status functions, the RX functions must not be mixed: use only the `_irqsafe` form. The `skb` is allocated with `dev_alloc_skb()`, which is safe in the interrupt handler.

| Field | Set from | Notes |
|---|---|---|
| `freq`, `band` | The current channel, `dev->conf.chandef.chan` | Not the tuned LO. With `restrict_freq_mhz` set, the radio listens on a different frequency from the one reported. |
| `signal` | RSSI in dBm | Required by `SIGNAL_DBM`. |
| `rate_idx`, `encoding`, `bw` | The rate field of the RX header | A legacy rate becomes an index into the band's rate table through `wifi_rate_table_mapping`. An HT rate uses `RX_ENC_HT` with its MCS. Bandwidth is always 20 MHz. |
| `enc_flags` | The short GI bit | |
| `mactime` | The 64-bit TSF in the RX header | Flagged `RX_FLAG_MACTIME_START`, meaning the TSF at the start of the frame. |
| `flag` | The FCS-OK bit | A frame with a bad FCS gets `RX_FLAG_FAILED_FCS_CRC`. `mac80211` drops it from normal processing and passes it only to monitor interfaces. |
| `ampdu_reference`, `RX_FLAG_AMPDU_*` | The aggregation bits | `ampdu_reference` counts up after the last subframe of each aggregate. |
| `antenna` | The selected RX antenna | |

## Interfaces

`interface_modes` and `iface_combinations` tell `cfg80211` which interfaces it may create. `add_interface` runs later, when an interface comes up, and is where the driver accepts or refuses it.

| Type | Advertised | `add_interface` | Notes |
|---|---|---|---|
| Station | Yes | Accepts | |
| AP | Yes | Accepts | |
| Ad-hoc (IBSS) | Yes | Accepts | |
| Monitor | Yes | Accepts | |
| Mesh point | Yes | Accepts | Counted in the interface limits only when the kernel has `CONFIG_MAC80211_MESH`. |
| P2P client, P2P GO | Yes | Accepts | `mac80211` passes them as station and AP with `vif->p2p` set. |
| OCB | Yes | Refuses with `-EOPNOTSUPP` | `iw` can create the interface, but bringing it up fails. |

If you add a type to `interface_modes`, add it to the `switch` in `openwifi_add_interface()` in the same change.

!!! warning "The FPGA holds one MAC address"
    `iface_combinations` allows up to `MAX_NUM_VIF` (4) interfaces on one channel. The `xpu` has a single MAC address register, and every `add_interface` call overwrites it with the new interface's address. The FPGA then filters unicast frames and sends ACKs only for the interface added most recently. The address stays in the register after that interface is removed. Run several interfaces at once only when they share one MAC address, or extend the `xpu` first.

## Shared with the rest of openwifi

### The FPGA

The driver and the FPGA share several layouts that no compiler checks. They ship as a matched set (see [Versions this wiki targets](Repositories.md#versions-this-wiki-targets)), so a change on one side needs the same change on the other.

- **Register addresses.** `driver/hw_def.h` gives each register as a word offset that must match a `slv_regN` in the core's `*_s_axi.v`. See [Where the registers are defined](Driver-Architecture.md#where-the-registers-are-defined).
- **Per-frame TX words.** `openwifi_tx()` packs these words and writes them to `tx_intf` before each DMA transfer:

    ```c
    phy_hdr_config = ( ht_aggr_start<<20 | rate_hw_value<<16 | use_ht_rate<<15 | use_short_gi<<14 | use_ht_aggr<<13 | len_psdu );
    tx_config = ( prio<<26 | ring->bd_wr_idx<<20 | queue_idx<<18 | retry_limit_hw_value<<14 | pkt_need_ack<<13 | num_dma_symbol );
    ```

- **TX status words.** `openwifi_tx_interrupt()` decodes `TX_INTF_REG_PKT_INFO1` to `TX_INTF_REG_PKT_INFO4`. The FPGA returns the descriptor index and the Linux priority that it received in `tx_config`, and the driver uses them to find each frame's `skb`. For a frame that is not aggregated, bit 0 of the block ACK bitmap is the ACK result. `num_slot_random` and `cw` describe the backoff the FPGA used, and the driver only prints them.

    ```c
    nof_retx        = (reg_val1&0xF);
    last_bd_rd_idx  = ((reg_val1>>5)&(NUM_TX_BD-1));
    queue_idx       = ((reg_val1>>15)&(MAX_NUM_HW_QUEUE-1));
    prio            = ((reg_val1>>17)&0x3);
    num_slot_random = ((reg_val1>>19)&0x1FF);
    cw              = ((reg_val1>>28)&0xF);
    pkt_cnt         = (reg_val2&0x3F);
    blk_ack_ssn     = ((reg_val2>>6)&0xFFF);
    // PKT_INFO3 and PKT_INFO4 hold the 64-bit block ACK bitmap
    ```

- **Descriptor count.** `NUM_TX_BD` (64) must match the FIFO depth in `tx_bit_intf.v`. `openwifi_tx_interrupt()` also writes 64 as a literal number when it computes `bd_rd_idx`, so change that line together with `NUM_TX_BD`.
- **RX buffer slots.** Each slot starts with the 16-byte header described in [The receive path inside the driver](Driver-Architecture.md#the-receive-path-inside-the-driver). After processing a slot, the driver writes 0 to the 16-bit field at offset 10, which `rx_intf` sets to mark a new packet. The handler finds new packets by that field, so the write is part of the handshake with `rx_intf`.

### User space

`sdrctl` and the scripts in [`user_space/`](https://github.com/open-sdr/openwifi/tree/master/user_space) depend on numbers and names defined in the driver. None of them fail at build time when the driver changes.

| Interface | Defined in | Used by | Rule |
|---|---|---|---|
| `sdrctl` command and attribute numbers | [`user_space/sdrctl_src/nl80211_testmode_def.h`](https://github.com/open-sdr/openwifi/blob/master/user_space/sdrctl_src/nl80211_testmode_def.h), which `sdr.c` includes directly | `sdrctl` | One copy serves both sides. Add new entries at new numbers and never renumber old ones, or an `sdrctl` built earlier sends the wrong command. |
| Register categories 1 to 9 | `enum sdrctl_reg_cat` in `driver/sdr.h`, and again as literal numbers in `user_space/sdrctl_src/cmd.c` | `sdrctl dev sdr0 set reg <category> ...` | Two copies. Change both together. See [Two channels to user space](Driver-Architecture.md#two-channels-to-user-space). |
| Driver register indices (`DRV_TX_REG_IDX_*`, `DRV_RX_REG_IDX_*`, `DRV_XPU_REG_IDX_*`) | `driver/sdr.h` | Scripts and documented commands, by number. For example, `set_lbt_th.sh` writes `drv_xpu 0`. | Moving an index breaks every script and command that uses the old number. See the [register reference](sdrctl-and-Runtime-Control.md#register-reference). |
| sysfs attribute names | `driver/sysfs_intf.c` | `stat_enable.sh`, `rx_stat_show.sh`, `tx_stat_show.sh`, `cw_max_min_cfg.sh`, `set_restrict_freq.sh`, and others | The scripts open the files by name. A rename breaks them silently. |
| sysfs directory | The device-tree node names | Every sysfs script, which tries `/sys/devices/platform/fpga-axi@0/fpga-axi@0:sdr` and then `/sys/devices/soc0/fpga-axi@0/fpga-axi@0:sdr` | Renaming the `fpga-axi@0` node or the `sdr` node moves the directory. |

### The device tree

The driver finds its hardware through the device tree, as described in [How the driver finds its hardware](Driver-Architecture.md#how-the-driver-finds-its-hardware). These names and indices must match:

| Item | Value | Read by |
|---|---|---|
| Main node `compatible` | `sdr,sdr` | `openwifi_dev_of_ids` in `sdr.c` |
| Core node `compatible` | `sdr,xpu`, `sdr,tx_intf`, `sdr,rx_intf`, `sdr,openofdm_tx`, `sdr,openofdm_rx` | The per-core modules |
| DMA channel names | `rx_dma_s2mm`, `tx_dma_mm2s` | `openwifi_start()` |
| Interrupt indices | 1 for RX, 3 for TX | `openwifi_start()` |
| Root `model` string and the `lmk` node | Decide `hardware_type` and `fpga_type` (see [board detection](Driver-Architecture.md#how-the-driver-finds-its-hardware)) | `openwifi_dev_probe()` |
| `ad9361-phy` on the SPI bus, `cf-ad9361-dds-core-lpc` platform device | Must exist and be probed by the Analog Devices drivers (except on the RFSoC4x2) | `openwifi_dev_probe()` |

The DMA channels and interrupts are claimed in `start`, not at probe. A wrong name or index therefore does not fail when the module loads. It fails when `sdr0` comes up.

## When the kernel changes

The `mac80211` driver interface changes between kernel versions. A driver written for an older kernel fails in one of two ways:

- **A required callback is missing.** `ieee80211_alloc_hw()` prints a kernel warning and returns `NULL`. `sdr.ko` loads, but the probe fails and `sdr0` never appears.
- **A callback signature changed.** The build fails, or it prints an incompatible pointer type warning. Treat that warning as an error, because the kernel calls the function with the new arguments.

Upstream openwifi already follows the Linux 6.12 interface:

- `wake_tx_queue` is set to `ieee80211_handle_wake_tx_queue`.
- The channel-context callbacks use the emulation helpers.
- `conf_tx` takes a `link_id` argument, and `stop` takes a `suspend` argument.
- `ieee80211_beacon_get()` takes a link ID, which openwifi passes as 0.
- Station capabilities come from `sta->deflink`, for example `link->ht_cap` in `openwifi_ampdu_action()`.

The OpenWrt build uses a newer `mac80211` (see the [version table](Repositories.md#versions-this-wiki-targets)), where `config`, `set_antenna`, `get_antenna`, and `set_rts_threshold` take an extra `radio_idx` argument. `sdr.c` keeps both forms behind `#ifdef OPENWRT`, including the calls to `openwifi_set_antenna()` in `openwifi_start()` and `openwifi_dev_probe()`. When you change one of these functions, change both branches and build both variants.

For a new kernel, read the checks at the top of `ieee80211_alloc_hw_nm()` in `net/mac80211/main.c` for the required callbacks. Read the comment above `struct ieee80211_ops` in `include/net/mac80211.h` for the context rule of each one.

## Before you merge a driver change

Run these checks on a board, with the changed driver loaded through [`wgd.sh`](Software-Development-Workflow.md#reloading-driver-and-fpga-without-rebooting).

1. **Compare the capabilities Linux sees.** Any difference you did not intend is a contract change.

    ```bash
    # With the unchanged driver loaded
    iw list > /root/iw_list_before.txt
    # Load the changed driver with wgd.sh, then run
    iw list > /root/iw_list_after.txt
    diff /root/iw_list_before.txt /root/iw_list_after.txt
    ```

2. **Bring the interface down and up twice, then reload the driver.** A `start` that does not undo a partial setup, or a `stop` that leaks a DMA channel or an interrupt, fails on the second round. `start` already leaks when one of its own steps fails (see [Callbacks](#callbacks)), so find the first failure in the kernel log before you blame the second.
3. **Run as a station and leave the link idle for several minutes.** The station must stay connected. Connection monitoring depends on the ACK status (see [What mac80211 does with the ACK status](#what-mac80211-does-with-the-ack-status)).
4. **Run as an AP with a client and send traffic.** Compare the TX ACK failure counters with the unchanged driver on the same setup (see [Statistics via sysfs](sdrctl-and-Runtime-Control.md#statistics-via-sysfs)). A large rise points at the TX status path before the radio link.
5. **Run an iperf regression check.** See [Regression check after a driver or FPGA change](Link-Testing-with-iperf.md#regression-check-after-a-driver-or-fpga-change).
6. **Check the kernel log for warnings.** A `WARNING: CPU` line is a `WARN_ON` in the kernel or in `mac80211`. On a kernel built with `CONFIG_DEBUG_ATOMIC_SLEEP`, a sleep in `tx` prints `BUG: sleeping function called from invalid context`. The `GFP_KERNEL` copy in `openwifi_tx()` (see [Transmit](#transmit)) can print this line on an unchanged driver, so compare with the unchanged driver before you blame your change.

    ```bash
    dmesg | grep -E "WARNING: CPU|BUG:"
    ```

7. **If you changed a callback that has an `OPENWRT` branch, build both variants.**
