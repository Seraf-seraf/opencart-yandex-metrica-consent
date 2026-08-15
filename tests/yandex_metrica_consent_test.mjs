import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const script = fs.readFileSync(path.join(root, 'upload/catalog/view/javascript/yandex_metrica_consent/yandex_metrica_consent.js'), 'utf8');
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
		if (selector === '[data-cookie-consent]' && this.attributes.has('data-cookie-consent')) {
			return this;
		}

		if (selector === '[data-cookie-settings]' && this.attributes.has('data-cookie-settings')) {
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

	focus() {
		this.ownerDocument.focused = this;
	}
}

class Document {
	constructor(config) {
		this.readyState = 'loading';
		this.requests = [];
		this.scripts = [];
		this.listeners = new Map();
		this.cookies = new Map();
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

	dispatchEvent() {
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

	assert.deepEqual(document.requests, []);
	assert.equal(window.dataLayer, undefined);
	assert.equal(document.getElementById('analytics-cookie-banner').hidden, false);
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
