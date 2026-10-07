import { LEAD_SHEET_HEADERS } from './config.mjs';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

export class LeadSinkError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * يستعمل Application Default Credentials في وقت التشغيل (Cloud Run/Workload Identity).
 * لا توجد مفاتيح JSON أو اعتماد متصفح في هذا المستودع.
 */
export async function createGoogleAccessTokenProvider() {
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({ scopes: [SHEETS_SCOPE] });
  const client = await auth.getClient();

  return async function getAccessToken() {
    const result = await client.getAccessToken();
    const token = typeof result === 'string' ? result : result?.token;
    if (!token) throw new LeadSinkError('adc_token_unavailable');
    return token;
  };
}

export function leadToSheetRow(lead) {
  return [
    lead.requestId,
    lead.createdAt,
    lead.name,
    lead.company,
    lead.phone,
    lead.email,
    lead.service,
    lead.city,
    lead.sites,
    lead.startDate,
    lead.message,
    lead.locale,
    lead.sourcePage,
    lead.consentVersion,
    lead.status,
  ];
}

/**
 * لا ينشئ tab، لا يقرأ قاعدة البيانات، ولا يعيد append عند خطأ شبكة/استجابة ملتبسة.
 * RAW يمنع Google Sheets من تفسير مدخلات العميل كصيغ.
 */
export function createSheetsSink({ spreadsheetId, sheetName, getAccessToken, fetchImpl = globalThis.fetch }) {
  if (!spreadsheetId || !sheetName || typeof getAccessToken !== 'function' || typeof fetchImpl !== 'function') {
    throw new TypeError('Invalid Sheets sink configuration');
  }

  const range = `${encodeURIComponent(sheetName)}!A:O`;
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

  return Object.freeze({
    headers: LEAD_SHEET_HEADERS,
    async append(lead) {
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${await getAccessToken()}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ values: [leadToSheetRow(lead)] }),
        });
      } catch {
        // الحالة قد تكون ملتبسة لدى الشبكة؛ لا نعيد append كي لا نكرر الطلب.
        throw new LeadSinkError('append_unconfirmed');
      }

      let data;
      try {
        data = await response.json();
      } catch {
        throw new LeadSinkError('append_unconfirmed');
      }

      if (!response.ok || data?.updates?.updatedRows !== 1) {
        throw new LeadSinkError('append_unconfirmed');
      }

      return Object.freeze({ updatedRows: 1 });
    },
  });
}

export { SHEETS_SCOPE };
