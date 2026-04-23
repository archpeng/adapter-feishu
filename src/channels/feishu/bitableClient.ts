import * as lark from '@larksuiteoapi/node-sdk';

export type FeishuUserIdType = 'user_id' | 'union_id' | 'open_id';

export interface BitableClientConfig {
  appId: string;
  appSecret: string;
}

export interface BitableTableTarget {
  appToken: string;
  tableId: string;
}

export interface BitableFormTarget extends BitableTableTarget {
  formId: string;
}

export interface CreateBitableRecordRequest extends BitableTableTarget {
  fields: Record<string, unknown>;
  clientToken?: string;
  userIdType?: FeishuUserIdType;
  ignoreConsistencyCheck?: boolean;
}

export interface ListBitableFormFieldsRequest extends BitableFormTarget {
  pageSize?: number;
  pageToken?: string;
}

export interface BitableRecord {
  recordId?: string;
  fields: Record<string, unknown>;
  createdTime?: number;
  lastModifiedTime?: number;
}

export interface BitableForm {
  formId: string;
  name?: string;
  description?: string;
  shared?: boolean;
  sharedUrl?: string;
  sharedLimit?: 'off' | 'tenant_editable' | 'anyone_editable';
  submitLimitOnce?: boolean;
}

export interface BitableFormField {
  fieldId?: string;
  title?: string;
  description?: string;
  required?: boolean;
  visible?: boolean;
}

export interface BitableFormFieldPage {
  items: BitableFormField[];
  hasMore: boolean;
  pageToken?: string;
  total?: number;
}

export interface BitableClient {
  createRecord(request: CreateBitableRecordRequest): Promise<BitableRecord>;
  getForm(request: BitableFormTarget): Promise<BitableForm>;
  listFormFields(request: ListBitableFormFieldsRequest): Promise<BitableFormFieldPage>;
}

interface BitableSdkClient {
  bitable: {
    appTableRecord: {
      create(payload: {
        path: {
          app_token: string;
          table_id: string;
        };
        params?: {
          user_id_type?: FeishuUserIdType;
          client_token?: string;
          ignore_consistency_check?: boolean;
        };
        data: {
          fields: Record<string, unknown>;
        };
      }): Promise<{
        code?: number;
        msg?: string;
        data?: {
          record?: {
            record_id?: string;
            fields?: Record<string, unknown>;
            created_time?: number;
            last_modified_time?: number;
          };
        };
      }>;
    };
    appTableForm: {
      get(payload: {
        path: {
          app_token: string;
          table_id: string;
          form_id: string;
        };
      }): Promise<{
        code?: number;
        msg?: string;
        data?: {
          form?: {
            name?: string;
            description?: string;
            shared?: boolean;
            shared_url?: string;
            shared_limit?: 'off' | 'tenant_editable' | 'anyone_editable';
            submit_limit_once?: boolean;
          };
        };
      }>;
    };
    appTableFormField: {
      list(payload: {
        path: {
          app_token: string;
          table_id: string;
          form_id: string;
        };
        params?: {
          page_size?: number;
          page_token?: string;
        };
      }): Promise<{
        code?: number;
        msg?: string;
        data?: {
          items?: Array<{
            field_id?: string;
            title?: string;
            description?: string;
            required?: boolean;
            visible?: boolean;
          }>;
          page_token?: string;
          has_more?: boolean;
          total?: number;
        };
      }>;
    };
  };
}

export interface BitableClientDeps {
  createSdkClient(config: BitableClientConfig): BitableSdkClient;
}

const defaultDeps: BitableClientDeps = {
  createSdkClient(config) {
    return new lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu
    }) as unknown as BitableSdkClient;
  }
};

export function createBitableClient(
  config: BitableClientConfig,
  deps: BitableClientDeps = defaultDeps
): BitableClient {
  const sdkClient = deps.createSdkClient(config);

  return {
    async createRecord(request) {
      const response = assertSdkSuccess(
        await sdkClient.bitable.appTableRecord.create({
          path: {
            app_token: request.appToken,
            table_id: request.tableId
          },
          params: {
            user_id_type: request.userIdType ?? 'user_id',
            client_token: request.clientToken,
            ignore_consistency_check: request.ignoreConsistencyCheck
          },
          data: {
            fields: request.fields
          }
        }),
        'Failed to create Feishu Bitable record'
      );

      const record = recordValue(response.data?.record);
      return {
        recordId: stringValue(record?.record_id),
        fields: recordValue(record?.fields) ?? request.fields,
        createdTime: numberValue(record?.created_time),
        lastModifiedTime: numberValue(record?.last_modified_time)
      };
    },

    async getForm(request) {
      const response = assertSdkSuccess(
        await sdkClient.bitable.appTableForm.get({
          path: {
            app_token: request.appToken,
            table_id: request.tableId,
            form_id: request.formId
          }
        }),
        'Failed to get Feishu Bitable form'
      );

      const form = recordValue(response.data?.form);
      return {
        formId: request.formId,
        name: stringValue(form?.name),
        description: stringValue(form?.description),
        shared: booleanValue(form?.shared),
        sharedUrl: stringValue(form?.shared_url),
        sharedLimit: sharedLimitValue(form?.shared_limit),
        submitLimitOnce: booleanValue(form?.submit_limit_once)
      };
    },

    async listFormFields(request) {
      const response = assertSdkSuccess(
        await sdkClient.bitable.appTableFormField.list({
          path: {
            app_token: request.appToken,
            table_id: request.tableId,
            form_id: request.formId
          },
          params: {
            page_size: request.pageSize,
            page_token: request.pageToken
          }
        }),
        'Failed to list Feishu Bitable form fields'
      );

      const data = recordValue(response.data);
      const rawItems = Array.isArray(data?.items) ? data.items : [];
      return {
        items: rawItems.map((item) => {
          const field = recordValue(item);
          return {
            fieldId: stringValue(field?.field_id),
            title: stringValue(field?.title),
            description: stringValue(field?.description),
            required: booleanValue(field?.required),
            visible: booleanValue(field?.visible)
          };
        }),
        hasMore: booleanValue(data?.has_more) ?? false,
        pageToken: stringValue(data?.page_token),
        total: numberValue(data?.total)
      };
    }
  };
}

function assertSdkSuccess<T extends { code?: number; msg?: string }>(response: T, context: string): T {
  if ((response.code ?? 0) !== 0) {
    throw new Error(`${context}: ${response.msg ?? 'unknown_error'}`);
  }
  return response;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function sharedLimitValue(
  value: unknown
): 'off' | 'tenant_editable' | 'anyone_editable' | undefined {
  return value === 'off' || value === 'tenant_editable' || value === 'anyone_editable'
    ? value
    : undefined;
}
