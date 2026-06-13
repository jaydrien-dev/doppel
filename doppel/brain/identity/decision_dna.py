"""
Decision DNA
============
Converts a clone's quantified decision profile (8 psychological dimensions,
each 0–100) into concrete, actionable reasoning instructions injected into
the system prompt.

This is Doppel's core differentiator: not how a clone talks, but how it thinks.

Dimensions (all 0–100):
  risk_tolerance        — 0=avoid all downside,       100=embrace high-variance bets
  time_horizon          — 0=immediate results only,   100=long-term compounding
  intuition_vs_analysis — 0=pure gut / pattern,       100=full deliberation / data
  loss_aversion         — 0=losses barely register,   100=losses weigh 2× gains
  ambiguity_tolerance   — 0=needs certainty to act,   100=acts freely in fog
  contrarianism         — 0=follows consensus,         100=ignores consensus
  information_threshold — 0=decides on minimal data,  100=exhaustive research needed
  sunk_cost_resistance  — 0=anchored to past spend,   100=purely forward-looking
"""
from __future__ import annotations


_EMPTY_PROFILE: dict = {}

_DEFAULTS: dict[str, int] = {
    "risk_tolerance":        50,
    "time_horizon":          65,
    "intuition_vs_analysis": 62,
    "loss_aversion":         50,
    "ambiguity_tolerance":   65,
    "contrarianism":         45,
    "information_threshold": 68,
    "sunk_cost_resistance":  75,
}


def _get(profile: dict, key: str) -> int:
    return int(profile.get(key, _DEFAULTS[key]))


def render_decision_dna(profile: dict) -> str:
    """
    Convert a decision profile dict into a system prompt block.
    Returns empty string if profile is empty (no template set).
    """
    if not profile:
        return ""

    r   = _get(profile, "risk_tolerance")
    th  = _get(profile, "time_horizon")
    ia  = _get(profile, "intuition_vs_analysis")
    la  = _get(profile, "loss_aversion")
    at  = _get(profile, "ambiguity_tolerance")
    ct  = _get(profile, "contrarianism")
    it  = _get(profile, "information_threshold")
    scr = _get(profile, "sunk_cost_resistance")

    lines: list[str] = ["## Decision-Making Architecture"]
    lines.append(
        "When evaluating options, making recommendations, or reasoning through trade-offs, "
        "apply the following calibrated decision framework:"
    )

    # ── Risk tolerance ────────────────────────────────────────────────────────
    if r <= 25:
        lines.append("- **Risk**: Strongly prefer the lower-variance option. Flag downside scenarios explicitly. Require clear margin of safety before recommending action.")
    elif r <= 45:
        lines.append("- **Risk**: Lean conservative. Acceptable risk must be bounded and recoverable. Prefer reversible decisions over irreversible ones.")
    elif r <= 65:
        lines.append("- **Risk**: Balanced risk posture. Weigh upside and downside evenly. Acceptable to take calculated risks when expected value is clearly positive.")
    elif r <= 80:
        lines.append("- **Risk**: Lean toward higher-variance options when upside is asymmetric. Downside is acceptable if bounded. Bias toward action over caution.")
    else:
        lines.append("- **Risk**: High risk tolerance. Embrace high-variance bets when the upside is significant. Inaction is often the bigger risk.")

    # ── Time horizon ─────────────────────────────────────────────────────────
    if th <= 25:
        lines.append("- **Time horizon**: Optimize for near-term outcomes. What solves the problem now? Long-term optionality is a secondary consideration.")
    elif th <= 45:
        lines.append("- **Time horizon**: Mostly near-term focus. Consider 3–6 month consequences, but don't over-index on distant scenarios.")
    elif th <= 65:
        lines.append("- **Time horizon**: Balanced. Weigh immediate gains against 1–2 year consequences. Avoid short-term fixes that create long-term debt.")
    elif th <= 80:
        lines.append("- **Time horizon**: Long-term oriented. Prefer decisions that compound well over time. Short-term pain is acceptable for durable gains.")
    else:
        lines.append("- **Time horizon**: Very long-term. Ask: what does this look like in 5–10 years? Willingness to sacrifice short-term for compounding advantage.")

    # ── Intuition vs analysis ─────────────────────────────────────────────────
    if ia <= 25:
        lines.append("- **Reasoning style**: Trust pattern recognition and intuition. When something feels right based on experience, that signal is valid. Don't over-analyze.")
    elif ia <= 45:
        lines.append("- **Reasoning style**: Lean on intuition and quick heuristics. Use analysis to gut-check, not to lead. Speed and decisiveness matter.")
    elif ia <= 65:
        lines.append("- **Reasoning style**: Balanced — use intuition to generate options, analysis to select between them. Avoid both paralysis and recklessness.")
    elif ia <= 80:
        lines.append("- **Reasoning style**: Analytical. Structure the problem, enumerate options, weigh evidence before concluding. Slow down to get it right.")
    else:
        lines.append("- **Reasoning style**: Deeply deliberate. Decompose the problem systematically. Don't recommend until you've considered second-order effects and edge cases.")

    # ── Loss aversion ─────────────────────────────────────────────────────────
    if la <= 25:
        lines.append("- **Loss framing**: Treat potential losses and gains symmetrically. Don't over-weight what could go wrong. Losses are recoverable.")
    elif la <= 45:
        lines.append("- **Loss framing**: Slight sensitivity to downside. Mention risks but don't let them dominate the recommendation. Gains and losses roughly equal weight.")
    elif la <= 65:
        lines.append("- **Loss framing**: Standard loss sensitivity. A loss stings more than an equivalent gain feels good — factor this into recommendations.")
    elif la <= 80:
        lines.append("- **Loss framing**: Loss-sensitive. Explicitly map what could be lost. A bad outcome often outweighs a good outcome of equal magnitude.")
    else:
        lines.append("- **Loss framing**: Strongly loss-averse. Prevention of downside often trumps pursuit of upside. Require strong expected value before accepting loss risk.")

    # ── Ambiguity tolerance ───────────────────────────────────────────────────
    if at <= 25:
        lines.append("- **Uncertainty**: Seek clarity before acting. If key variables are unknown, recommend gathering information first. Don't decide in a fog.")
    elif at <= 45:
        lines.append("- **Uncertainty**: Prefer known quantities. Acknowledge gaps and factor them into confidence. Partial information should widen the recommendation range.")
    elif at <= 65:
        lines.append("- **Uncertainty**: Comfortable with incomplete information. Make best-available recommendations with stated assumptions. Flag uncertainty without being paralyzed by it.")
    elif at <= 80:
        lines.append("- **Uncertainty**: Comfortable acting in ambiguity. State key assumptions and proceed. Waiting for certainty is often the wrong move.")
    else:
        lines.append("- **Uncertainty**: High ambiguity tolerance. Act decisively even with very incomplete information. Adapt as facts emerge rather than waiting for them.")

    # ── Contrarianism ─────────────────────────────────────────────────────────
    if ct <= 25:
        lines.append("- **Consensus**: Give significant weight to conventional wisdom, expert consensus, and established norms. If most informed people agree, that's strong signal.")
    elif ct <= 45:
        lines.append("- **Consensus**: Generally respect consensus but look for cases where it may be wrong. Be willing to diverge with clear justification.")
    elif ct <= 65:
        lines.append("- **Consensus**: Balanced. Consensus is a data point, not a verdict. Weigh it alongside first-principles reasoning.")
    elif ct <= 80:
        lines.append("- **Consensus**: Lean contrarian. Question consensus actively. Popular views are often already priced in; the edge is in seeing what others miss.")
    else:
        lines.append("- **Consensus**: Strongly contrarian. If everyone agrees, ask why — and whether the popular view has a hidden flaw. Independent reasoning over group think.")

    # ── Information threshold ─────────────────────────────────────────────────
    if it <= 25:
        lines.append("- **Information needs**: Decide and act on minimal data. Perfect is the enemy of good. Move fast and correct course.")
    elif it <= 45:
        lines.append("- **Information needs**: Require basic evidence before recommending. Some data is better than none, but don't stall for completeness.")
    elif it <= 65:
        lines.append("- **Information needs**: Moderate information standard. Gather the most important inputs, acknowledge what's unknown, then decide.")
    elif it <= 80:
        lines.append("- **Information needs**: High information standard. Important decisions warrant thorough evidence. Identify what's missing and request it.")
    else:
        lines.append("- **Information needs**: Rigorous. Major decisions require comprehensive analysis. Flag whenever a recommendation rests on incomplete data.")

    # ── Sunk cost resistance ──────────────────────────────────────────────────
    if scr <= 25:
        lines.append("- **Past investment**: Give real weight to what has already been invested — time, money, effort. Abandoning something with history requires very strong justification.")
    elif scr <= 45:
        lines.append("- **Past investment**: Acknowledge sunk costs but try not to let them dominate. The past matters, but shouldn't override clear forward-looking logic.")
    elif scr <= 65:
        lines.append("- **Past investment**: Balanced view. Note what's been invested, but evaluate primarily on future expected value.")
    elif scr <= 80:
        lines.append("- **Past investment**: Forward-looking. Sunk costs are history — evaluate based on what happens from here. Cutting losses is rational, not failure.")
    else:
        lines.append("- **Past investment**: Pure forward-looking. What was spent before is irrelevant to what should happen next. Recommend based solely on future expected value.")

    return "\n".join(lines)
