"""Google Gemini AI integration for failure analysis and schedule explanation."""

from __future__ import annotations

import json

from app.config import settings
from app.core.schemas import FactoryState, Schedule


def _get_client():
    """Lazy-init Gemini client to avoid import errors when key is not set."""
    from google import genai
    return genai.Client(api_key=settings.gemini_api_key)


async def analyze_failure(factory_state: FactoryState, scenario: dict) -> str:
    """Ask Gemini to explain the failure impact in operator-friendly language."""
    client = _get_client()

    prompt = f"""You are an industrial operations analyst for a manufacturing facility called Optifab.

A machine failure has just occurred on the factory floor. Analyze the situation concisely.

**Factory state at failure:**
- Failed machines: {factory_state.failedMachineIds}
- Simulation time: {factory_state.simulationTime} minutes
- Blocked jobs: {factory_state.blockedJobIds}
- Machine states: {json.dumps({k: v.model_dump() for k, v in factory_state.machineStates.items()}, indent=2)}

**Factory scenario (machines and jobs):**
{json.dumps(scenario, indent=2)}

Provide a brief analysis covering:
1. What happened and which operations are directly affected
2. Cascading impact on downstream operations and machines
3. Which machines have capacity to absorb rescheduled work
4. Recommended priority for rescheduling

Keep it concise and actionable — this is for a factory operator dashboard."""

    response = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    return response.text


async def explain_schedule(
    baseline: Schedule,
    recovery: Schedule,
    recovery_makespan: int,
    classical_makespan: int | None = None,
) -> str:
    """Ask Gemini to explain the recovery schedule vs baseline."""
    client = _get_client()

    # Summarize key differences
    baseline_ops = {op.operationId: op for op in baseline.operations}
    recovery_ops = {op.operationId: op for op in recovery.operations}

    changes = []
    for op_id, rec_op in recovery_ops.items():
        base_op = baseline_ops.get(op_id)
        if base_op and (rec_op.machineId != base_op.machineId or rec_op.start != base_op.start):
            changes.append(
                f"  {op_id}: {base_op.machineId}[{base_op.start}-{base_op.end}] "
                f"-> {rec_op.machineId}[{rec_op.start}-{rec_op.end}]"
            )

    changes_text = "\n".join(changes) if changes else "  (no changes)"
    comparison = ""
    if classical_makespan:
        comparison = f"\nClassical solver makespan: {classical_makespan} minutes"

    prompt = f"""You are an industrial operations analyst. A quantum optimizer (QAOA) has proposed
a recovery schedule after a machine failure. Explain the result to a factory operator.

**Recovery schedule makespan:** {recovery_makespan} minutes{comparison}
**Baseline makespan:** {max(op.end for op in baseline.operations)} minutes

**Operations that changed from baseline:**
{changes_text}

Provide:
1. A plain-language summary of what changed and why
2. Whether the recovery schedule is efficient
3. Any tradeoffs the operator should be aware of

Keep it brief and clear for a dashboard display."""

    response = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    return response.text
