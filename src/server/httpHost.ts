import type { IngressMode } from '../config.js';
import type { DispatchRequest, DispatchResponse } from '../channels/feishu/webhook.js';
import type { CardActionRequest, CardActionResponse } from './cardAction.js';
import type { ProviderWebhookRequest, ProviderWebhookResponse } from './providerWebhook.js';

export interface AdapterHttpRequest {
  method?: string;
  pathname?: string;
  headers: DispatchRequest['headers'];
  rawBody: string;
}

export type AdapterHttpResponse = DispatchResponse | ProviderWebhookResponse | CardActionResponse;

export interface AdapterHttpDispatchDeps {
  ingressMode: IngressMode;
  providerKeys: string[];
  handleFeishuWebhook(request: DispatchRequest): Promise<DispatchResponse>;
  handleProviderWebhook(request: ProviderWebhookRequest): Promise<ProviderWebhookResponse>;
  handleCardAction(request: CardActionRequest): Promise<CardActionResponse>;
}

export async function dispatchAdapterHttpRequest(
  request: AdapterHttpRequest,
  deps: AdapterHttpDispatchDeps
): Promise<AdapterHttpResponse> {
  const pathname = request.pathname ?? '/';

  if (pathname === '/health') {
    return {
      statusCode: 200,
      body: {
        code: 0,
        status: 'ok',
        ingressMode: deps.ingressMode,
        providers: deps.providerKeys
      }
    };
  }

  if (pathname === '/provider-webhook' || pathname === '/providers/webhook') {
    return deps.handleProviderWebhook(request);
  }

  if (pathname === '/card-action' || pathname === '/providers/card-action') {
    return deps.handleCardAction(request);
  }

  return deps.handleFeishuWebhook(request);
}
