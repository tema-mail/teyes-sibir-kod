// Отправка форм в приёмник Tilda – те же получатели (formservices), что у корзины и попапа записи живого
// teyes-sibir.ru (сняты с форм сайта 14.10.2026), поэтому заказы и заявки приходят туда же, куда сейчас.
// Как в milovini-samara: приёмник не отдаёт CORS-заголовки, запрос no-cors – ответ не читается,
// успехом считается то, что запрос ушёл без сетевой ошибки. Живой заявкой не проверено (нужно «да» владельца).
export const FORM_ACTION = 'https://forms.tildacdn.com/procces/';
export const FORM_SERVICES = ['bc183f93007c8e91fb51bb54640dd4ac', '831db808dab445004d50692285e8f8b0'];
export const TILDA = { projectId: '10257003', pageId: '65129687', formsKey: '6587a4c1f594936a29b6b24310257003' };

export async function sendForm(formName: string, fields: Record<string, string>): Promise<boolean> {
  const body = new URLSearchParams();
  FORM_SERVICES.forEach((s) => body.append('formservices[]', s));
  body.append('tildaspec-formname', formName);
  body.append('tildaspec-projectid', TILDA.projectId);
  body.append('tildaspec-pageid', TILDA.pageId);
  body.append('tildaspec-formskey', TILDA.formsKey);
  body.append('tildaspec-referer', location.href);
  for (const [k, v] of Object.entries(fields)) if (v) body.append(k, v);
  try {
    await fetch(FORM_ACTION, { method: 'POST', mode: 'no-cors', body });
    return true;
  } catch {
    return false;
  }
}

/** Телефон: 10–11 цифр (с 8 или +7 в начале). */
export const phoneOk = (v: string) => /^(\+?7|8)?\d{10}$/.test(v.replace(/[\s()-]/g, ''));
