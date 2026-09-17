/**
 * The shared body of the prompt transition routes (close, reopen, reveal):
 * authenticate a teacher, call the function, hint the screens when something
 * actually changed, answer with the prompt's new state.
 */

import { NextRequest, NextResponse } from 'next/server';
import { assertPadStaff, resolvePadCaller } from './caller';
import { PadRefusal, callPad, padErrorResponse, padJson } from './rpc';
import { isUuid } from './session-binding';
import { hintPrompt, padDb, type HintAudience } from './sessions';

export interface TransitionResult extends Record<string, unknown> {
  changed: boolean;
  prompt_id: string;
  state: 'open' | 'closed' | 'revealed';
  version: number;
}

export function transitionBody(result: TransitionResult) {
  return { promptId: result.prompt_id, state: result.state, version: result.version, changed: result.changed };
}

type RouteHandler = (request: NextRequest, context: { params: { id: string } }) => Promise<NextResponse>;

export function promptTransitionRoute(
  fn: 'pad_close' | 'pad_reopen' | 'pad_reveal',
  audience: HintAudience,
  context: string,
): RouteHandler {
  return async function handler(request, { params }) {
    try {
      const caller = await resolvePadCaller(request.headers.get('Authorization'));
      assertPadStaff(caller);
      if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');

      const result = await callPad<TransitionResult>(padDb(), fn, { p_actor: caller.user.id, p_prompt: params.id });
      if (result.changed) await hintPrompt(params.id, audience);
      return padJson(transitionBody(result));
    } catch (err) {
      return padErrorResponse(err, context);
    }
  };
}
