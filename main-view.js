'use strict';

const $ = (selector) => document.querySelector(selector);
const add = $('#add');
const editor = $('#editor');
const remove = $('#remove');
const titleInput = $('#title');
const bodyInput = $('#body');
const status = $('#status');
let prompts = [];
let selected = -1;
let saving = false;

function render() {
  $('#empty').hidden = prompts.length !== 0;
  $('#list').replaceChildren(...prompts.map(({ title, body }, index) => {
    const row = $('#row').content.firstElementChild.cloneNode(true);
    row.querySelector('h2').textContent = title;
    row.querySelector('.preview').textContent = body;
    const copy = row.querySelector('.copy');
    const edit = row.querySelector('.edit');
    const del = row.querySelector('.delete');
    copy.setAttribute('aria-label', '复制：' + title);
    edit.setAttribute('aria-label', '编辑：' + title);
    del.setAttribute('aria-label', '删除：' + title);
    copy.onclick = () => copyPrompt(body, copy);
    edit.onclick = () => openEditor(index);
    del.onclick = () => {
      selected = index;
      $('#remove-description').textContent = '「' + title + '」删除后无法恢复。';
      remove.querySelector('.error').textContent = '';
      remove.showModal();
    };
    return row;
  }));
}

function copyPrompt(body, button) {
  // Copy from a selection during the user's click; the sandbox has no clipboard bridge.
  const buffer = document.createElement('textarea');
  buffer.className = 'clipboard-buffer';
  buffer.value = body;
  buffer.readOnly = true;
  buffer.tabIndex = -1;
  document.body.append(buffer);
  buffer.focus({ preventScroll: true });
  buffer.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    // Leave the original text available in the editor.
  } finally {
    buffer.remove();
    button.focus({ preventScroll: true });
  }
  status.textContent = copied ? '已复制正文。' : '复制失败。可点「编辑」，再手动复制正文。';
}

function openEditor(index = -1) {
  selected = index;
  $('#editor-title').textContent = index < 0 ? '新增提示词' : '编辑提示词';
  titleInput.value = prompts[index]?.title ?? '';
  bodyInput.value = prompts[index]?.body ?? '';
  editor.querySelector('.error').textContent = '';
  editor.showModal();
}

async function save(dialog, next, message, focusIndex = -1) {
  if (saving) return;
  saving = true;
  const controls = dialog.querySelectorAll('input, textarea, button');
  for (const control of controls) control.disabled = true;
  const error = dialog.querySelector('.error');
  error.textContent = '';
  try {
    // shortcut: Cindy KV limits the whole library to 64 KiB; use a library store if larger collections are needed.
    const response = await fetch('/kv', { method: 'PUT', body: JSON.stringify({ prompts: next }) });
    if (!response.ok) throw new Error(response.status === 413 ? '提示词库已满。请缩短正文或删除不再使用的提示词。' : '保存失败，请重试。');
  } catch (cause) {
    error.textContent = cause instanceof TypeError ? '保存失败，请重试。' : cause.message;
    return;
  } finally {
    for (const control of controls) control.disabled = false;
    saving = false;
  }
  prompts = next;
  dialog.close();
  render();
  status.textContent = message;
  ($('#list').children[focusIndex]?.querySelector('.copy') ?? add).focus({ preventScroll: true });
}

add.onclick = () => openEditor();
for (const dialog of [editor, remove]) {
  dialog.querySelector('.cancel').onclick = () => dialog.close();
  dialog.addEventListener('cancel', (event) => { if (saving) event.preventDefault(); });
}

$('#edit-form').onsubmit = (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  const body = bodyInput.value;
  if (!title || !body.trim()) {
    editor.querySelector('.error').textContent = '请填写标题和正文。';
    (title ? bodyInput : titleInput).focus();
    return;
  }
  const next = [...prompts];
  const index = Math.max(0, selected);
  next.splice(index, selected < 0 ? 0 : 1, { title, body });
  void save(editor, next, '已保存。', index);
};
$('#remove-form').onsubmit = (event) => {
  event.preventDefault();
  const next = prompts.filter((_, index) => index !== selected);
  void save(remove, next, '已删除。', Math.min(selected, next.length - 1));
};

async function load() {
  try {
    const response = await fetch('/kv');
    if (!response.ok) throw new Error();
    const config = await response.json();
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error();
    const stored = config.prompts === undefined ? [] : config.prompts;
    if (!Array.isArray(stored) || !stored.every((item) =>
      typeof item?.title === 'string' && typeof item.body === 'string')) throw new Error();
    prompts = stored;
    render();
    add.disabled = false;
    status.textContent = '';
  } catch {
    status.textContent = '未能读取提示词。请重新打开此页后再试。';
  }
}
void load();
