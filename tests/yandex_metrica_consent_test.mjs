import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const script = fs.readFileSync(path.join(root, 'upload/catalog/view/javascript/yandex_metrica_consent/yandex_metrica_consent.js'), 'utf8');
const stylesheet = fs.readFileSync(path.join(root, 'upload/catalog/view/javascript/yandex_metrica_consent/yandex_metrica_consent.css'), 'utf8');
const template = fs.readFileSync(path.join(root, 'upload/catalog/view/theme/default/template/extension/analytics/yandex_metrica.twig'), 'utf8');

class Element {
	constructor(tagName, document) {
		this.tagName = tagName.toUpperCase();
		this.ownerDocument = document;
		this.attributes = new Map();
		this.children = [];
		this.listeners = new Map();
		this.parentNode = null;
		this.hidden = false;
		this.src = '';
		this.textContent = '';
	}

	set id(value) {
		this.setAttribute('id', value);
	}

	get id() {
		return this.getAttribute('id');
	}

	setAttribute(name, value) {
		this.attributes.set(name, String(value));
	}

	getAttribute(name) {
		return this.attributes.get(name) || '';
	}

	removeAttribute(name) {
		this.attributes.delete(name);
	}

	appendChild(child) {
		child.parentNode = this;
		this.children.push(child);
		return child;
	}

	insertBefore(child) {
		this.appendChild(child);

		if (child.tagName === 'SCRIPT') {
			this.ownerDocument.scripts.push(child);

			if (child.src === 'https://mc.yandex.ru/metrika/tag.js') {
				this.ownerDocument.requests.push(child.src);
			}
		}
	}

	addEventListener(type, listener) {
		if (!this.listeners.has(type)) {
			this.listeners.set(type, []);
		}

		this.listeners.get(type).push(listener);
	}

	emit(type, event) {
		for (const listener of this.listeners.get(type) || []) {
			listener(event);
		}
	}

	closest(selector) {
		const attribute = selector.match(/^\[([\w-]+)\]$/)?.[1];

		if (attribute && this.attributes.has(attribute)) {
			return this;
		}

		return null;
	}

	querySelector(selector) {
		const match = selector.match(/^\[([^=]+)(?:="([^"]+)")?\]$/);

		if (match) {
			const attribute = match[1];
			const expected = match[2];

			if (this.attributes.has(attribute) && (expected === undefined || this.getAttribute(attribute) === expected)) {
				return this;
			}
		}

		for (const child of this.children) {
			if (typeof child.querySelector === 'function') {
				const found = child.querySelector(selector);

				if (found) {
					return found;
				}
			}
		}

		return null;
	}

	get isConnected() {
		return this.parentNode !== null;
	}

	showModal() {
		this.setAttribute('open', '');
	}

	close() {
		this.attributes.delete('open');
	}

	focus() {
		this.ownerDocument.activeElement = this;
	}
}

class Document {
	constructor(config) {
		this.readyState = 'loading';
		this.requests = [];
		this.scripts = [];
		this.listeners = new Map();
		this.cookies = new Map();
		this.cookieWrites = [];
		this.body = new Element('body', this);
		this.head = new Element('head', this);
		this.footer = new Element('footer', this);
		this.config = new Element('div', this);
		this.config.setAttribute('id', 'yandex-metrica-consent-config');
		this.config.setAttribute('data-config', JSON.stringify(config));
		this.localScript = new Element('script', this);
		this.localScript.src = '/catalog/view/javascript/yandex_metrica_consent/yandex_metrica_consent.js';
		this.head.appendChild(this.localScript);
		this.scripts.push(this.localScript);
	}

	get cookie() {
		return Array.from(this.cookies.entries()).map(([name, value]) => name + '=' + value).join('; ');
	}

	set cookie(value) {
		this.cookieWrites.push(value);
		const parts = value.split(';').map((part) => part.trim());
		const separator = parts[0].indexOf('=');
		const name = parts[0].slice(0, separator);
		const cookieValue = parts[0].slice(separator + 1);
		const expired = parts.some((part) => part.toLowerCase() === 'max-age=0');

		if (expired) {
			this.cookies.delete(name);
		} else {
			this.cookies.set(name, cookieValue);
		}
	}

	getElementById(id) {
		if (id === 'yandex-metrica-consent-config') {
			return this.config;
		}

		return this.findById(this.body, id);
	}

	findById(element, id) {
		if (element.getAttribute('id') === id) {
			return element;
		}

		for (const child of element.children) {
			const found = this.findById(child, id);

			if (found) {
				return found;
			}
		}

		return null;
	}

	createElement(tagName) {
		return new Element(tagName, this);
	}

	createTextNode(text) {
		const node = new Element('#text', this);
		node.textContent = text;
		return node;
	}

	getElementsByTagName(tagName) {
		return tagName.toLowerCase() === 'script' ? this.scripts : [];
	}

	querySelector(selector) {
		return selector === '.site-footer__bottom' ? this.footer : this.body.querySelector(selector);
	}

	addEventListener(type, listener) {
		if (!this.listeners.has(type)) {
			this.listeners.set(type, []);
		}

		this.listeners.get(type).push(listener);
	}

	dispatchEvent(event) {
		for (const listener of this.listeners.get(event.type) || []) {
			listener(event);
		}

		return true;
	}

	ready() {
		for (const listener of this.listeners.get('DOMContentLoaded') || []) {
			listener();
		}
	}
}

function validConfig() {
	return {
		counter: 110751771,
		webvisor: false,
		ecommerce: true,
		currency: 'RUB',
		ecommerceEvent: {},
		goals: {},
		cookieDays: 365,
		privacyUrl: '/privacy-policy',
		banner: {
			title: 'Аналитические cookies',
			description: 'Описание',
			accept: 'Разрешить',
			reject: 'Отказаться',
			settings: 'Настройки',
			privacy: 'Политика'
		}
	};
}

function execute(config = validConfig()) {
	const document = new Document(config);
	const window = {
		document,
		location: {protocol: 'https:', hostname: 'example.test', reload() {}},
		setTimeout,
		clearTimeout
	};
	const context = vm.createContext({window, document, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }});

	vm.runInContext(script, context);
	document.ready();

	return {document, window};
}

test('does not request Metrica before consent', () => {
	const {document, window} = execute();
	const banner = document.getElementById('analytics-cookie-banner');

	assert.deepEqual(document.requests, []);
	assert.equal(window.dataLayer, undefined);
	assert.equal(banner.hidden, false);
	assert.equal(banner.getAttribute('data-cookie-mode'), '');
	assert.equal(banner.getAttribute('aria-modal'), 'false');
	assert.equal(document.getElementById('analytics-cookie-title').textContent, 'Аналитические cookies');
	assert.equal(document.getElementById('analytics-cookie-description').textContent, 'Описание');

	window.SyloraCookieConsent.open();
	banner.emit('cancel', {preventDefault() {}});
	assert.equal(banner.hidden, false);
	assert.equal(banner.getAttribute('data-cookie-mode'), '');
	assert.equal(banner.querySelector('[data-cookie-close]').hidden, true);
	assert.deepEqual(document.cookieWrites, []);
});

test('loads Metrica exactly once after repeated analytics consent', () => {
	const {document} = execute();
	const banner = document.getElementById('analytics-cookie-banner');
	const accept = banner.querySelector('[data-cookie-consent="analytics"]');

	banner.emit('click', {target: accept});
	banner.emit('click', {target: accept});

	assert.deepEqual(document.requests, ['https://mc.yandex.ru/metrika/tag.js']);
	assert.match(document.cookie, /sylora_cookie_consent=v1%3Aanalytics/);
});

test('closes and reopens settings without writing the saved choice', () => {
	for (const savedChoice of [
		{name: 'analytics', value: 'v1:analytics', label: 'Текущий выбор: аналитика разрешена', requestCount: 1},
		{name: 'essential', value: 'v1:essential', label: 'Текущий выбор: без аналитики', requestCount: 0},
	]) {
		const {document, window} = execute();
		const banner = document.getElementById('analytics-cookie-banner');
		const choiceButton = banner.querySelector('[data-cookie-consent="' + savedChoice.name + '"]');
		const settingsButton = document.footer.querySelector('[data-cookie-settings]');
		const changes = [];
		document.addEventListener('sylora:cookie-consent-changed', (event) => changes.push(event.detail.choice));
		banner.emit('click', {target: choiceButton});
		const writesAfterChoice = document.cookieWrites.slice();
		const counterDisabledAfterChoice = window.disableYaCounter110751771;

		for (const dismiss of [
			(close) => close.emit('click', {target: close}),
			() => banner.emit('cancel', {preventDefault() {}}),
		]) {
			document.dispatchEvent({type: 'click', target: settingsButton, preventDefault() {}});
			const close = banner.querySelector('[data-cookie-close]');

			assert.equal(banner.hidden, false);
			assert.equal(banner.getAttribute('data-cookie-mode'), 'settings');
			assert.equal(banner.getAttribute('aria-modal'), 'true');
			assert.equal(document.getElementById('analytics-cookie-title').textContent, 'Настройки аналитики');
			assert.equal(document.getElementById('analytics-cookie-choice').textContent, savedChoice.label);
			assert.equal(banner.querySelector('[data-cookie-privacy]').href, '/privacy-policy');
			assert.equal(close.hidden, false);
			assert.equal(document.activeElement, close);

			dismiss(close);
			assert.equal(banner.hidden, true);
			assert.equal(banner.getAttribute('aria-modal'), 'false');
			assert.equal(document.activeElement, settingsButton);
			assert.equal(window.SyloraCookieConsent.getChoice(), savedChoice.value);
			assert.deepEqual(document.cookieWrites, writesAfterChoice);
			assert.deepEqual(changes, [savedChoice.value]);
			assert.equal(document.requests.length, savedChoice.requestCount);
			assert.equal(window.disableYaCounter110751771, counterDisabledAfterChoice);
		}
	}
});

test('still applies both settings choices through the consent lifecycle', () => {
	const {document, window} = execute();
	const banner = document.getElementById('analytics-cookie-banner');
	const accept = banner.querySelector('[data-cookie-consent="analytics"]');
	const reject = banner.querySelector('[data-cookie-consent="essential"]');
	const changes = [];
	let reloaded = false;
	window.location.reload = () => { reloaded = true; };
	document.addEventListener('sylora:cookie-consent-changed', (event) => changes.push(event.detail.choice));
	banner.emit('click', {target: reject});
	window.SyloraCookieConsent.open();
	banner.emit('click', {target: accept});
	assert.equal(window.SyloraCookieConsent.getChoice(), 'v1:analytics');
	assert.equal(banner.hidden, true);
	assert.equal(window.disableYaCounter110751771, false);
	assert.equal(reloaded, false);
	assert.deepEqual(document.requests, ['https://mc.yandex.ru/metrika/tag.js']);

	document.cookie = '_ym_uid=tracked';
	window.SyloraCookieConsent.open();
	banner.emit('click', {target: reject});
	assert.equal(window.SyloraCookieConsent.getChoice(), 'v1:essential');
	assert.equal(banner.hidden, true);
	assert.equal(window.disableYaCounter110751771, true);
	assert.doesNotMatch(document.cookie, /_ym_uid/);
	assert.equal(reloaded, true);
	assert.deepEqual(changes, ['v1:essential', 'v1:analytics', 'v1:essential']);
});

test('styles settings as a compact dialog with a translucent backdrop and inner scroll', () => {
	assert.match(stylesheet, /\.ym-consent\[data-cookie-mode="settings"\]::backdrop\s*\{[^}]*background:\s*rgb\(48 37 30 \/ 33%\);/s);
	assert.match(stylesheet, /\.ym-consent\[data-cookie-mode="settings"\]\s*\{[^}]*max-width:\s*560px;[^}]*overflow-y:\s*auto;/s);
	assert.match(stylesheet, /\.ym-consent__privacy a\s*\{\s*color:\s*var\(--color-muted,\s*#6c6158\);\s*\}/);
});

test('rejects invalid config without rendering or requests', () => {
	const config = validConfig();
	config.counter = 'invalid';
	const {document, window} = execute(config);

	assert.equal(document.getElementById('analytics-cookie-banner'), null);
	assert.deepEqual(document.requests, []);
	assert.equal(window.SyloraCookieConsent, undefined);
});

test('uses an escaped data container and no executable inline config', () => {
	assert.match(template, /data-config="\{\{ config\|json_encode\|e\('html_attr'\) \}\}"/);
	assert.doesNotMatch(template, /window\.YandexMetricaConsentConfig/);
	assert.doesNotMatch(template, /type="application\/json"/);
	assert.doesNotMatch(script, /\beval\s*\(/);
	assert.doesNotMatch(script, /\.on(?:click|change|load)\s*=/);
});
