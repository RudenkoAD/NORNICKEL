var IgnisUI = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // packages/ui/src/index.js
  var src_exports2 = {};
  __export(src_exports2, {
    AdminDashboard: () => AdminDashboard_default,
    Banner: () => Banner_default,
    ChatView: () => ChatView_default,
    ConfirmDialog: () => ConfirmDialog_default,
    GraphPane: () => GraphPane_default,
    LOADING_ANALYZE: () => LOADING_ANALYZE,
    LOADING_FETCH: () => LOADING_FETCH,
    LOADING_GENERATE: () => LOADING_GENERATE,
    LOADING_SEARCH: () => LOADING_SEARCH,
    LOADING_THINKING: () => LOADING_THINKING,
    MessageDialog: () => MessageDialog_default,
    PromptDialog: () => PromptDialog_default,
    SyncSetupModal: () => SyncSetupModal_default,
    VaultManager: () => VaultManager_default,
    loadingWithText: () => loadingWithText
  });

  // packages/services/src/vault-service.js
  var API_BASE = "/api/vault";
  async function fetchJson(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(data.error || "Request failed");
    }
    return res.json();
  }
  var vaultService = {
    getCurrentVaultId() {
      return window.__currentVaultId || "";
    },
    async listVaults() {
      const list = await fetchJson(API_BASE + "/list");
      window.__vaultList = list;
      return list;
    },
    listVaultsSync() {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", API_BASE + "/list", false);
      xhr.send();
      if (xhr.status === 200) {
        const list = JSON.parse(xhr.responseText);
        window.__vaultList = list;
        return list;
      }
      return [];
    },
    async createVault(name) {
      await fetchJson(API_BASE + "/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      this._setVaultTrust(name);
      return this.listVaults();
    },
    createVaultSync(name) {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", API_BASE + "/create", false);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(JSON.stringify({ name }));
      if (xhr.status >= 400) {
        return null;
      }
      return true;
    },
    async renameVault(id2, newName) {
      await fetchJson(API_BASE + "/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vault: id2, name: newName })
      });
      this._migrateLocalStorage(id2, newName);
      if (id2 === this.getCurrentVaultId()) {
        window.__currentVaultId = newName;
        if (window.__vaultConfig) {
          window.__vaultConfig.id = newName;
        }
        history.replaceState(null, "", "/?vault=" + encodeURIComponent(newName));
      }
      return this.listVaults();
    },
    async deleteVault(id2) {
      await fetchJson(API_BASE + "/remove?vault=" + encodeURIComponent(id2), {
        method: "DELETE"
      });
      const wasCurrentVault = id2 === this.getCurrentVaultId();
      await this.listVaults();
      return { wasCurrentVault };
    },
    deleteVaultSync(id2) {
      const xhr = new XMLHttpRequest();
      xhr.open(
        "DELETE",
        API_BASE + "/remove?vault=" + encodeURIComponent(id2),
        false
      );
      xhr.send();
      return xhr.status < 400;
    },
    openVault(id2) {
      localStorage.setItem("last-vault", id2);
      const target = window.parent !== window ? window.parent : window;
      target.location.href = "/?vault=" + encodeURIComponent(id2);
    },
    _setVaultTrust(vaultId, trusted = true) {
      localStorage.setItem("enable-plugin-" + vaultId, String(trusted));
    },
    _migrateLocalStorage(oldId, newId2) {
      const pluginKey = "enable-plugin-";
      const oldVal = localStorage.getItem(pluginKey + oldId);
      if (oldVal !== null) {
        localStorage.setItem(pluginKey + newId2, oldVal);
        localStorage.removeItem(pluginKey + oldId);
      }
      if (localStorage.getItem("last-vault") === oldId) {
        localStorage.setItem("last-vault", newId2);
      }
    }
  };

  // node_modules/svelte/src/runtime/internal/utils.js
  function noop() {
  }
  function assign(tar, src) {
    for (const k in src)
      tar[k] = src[k];
    return (
      /** @type {T & S} */
      tar
    );
  }
  function run(fn) {
    return fn();
  }
  function blank_object() {
    return /* @__PURE__ */ Object.create(null);
  }
  function run_all(fns) {
    fns.forEach(run);
  }
  function is_function(thing) {
    return typeof thing === "function";
  }
  function safe_not_equal(a2, b) {
    return a2 != a2 ? b == b : a2 !== b || a2 && typeof a2 === "object" || typeof a2 === "function";
  }
  function is_empty(obj) {
    return Object.keys(obj).length === 0;
  }
  function create_slot(definition, ctx, $$scope, fn) {
    if (definition) {
      const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
      return definition[0](slot_ctx);
    }
  }
  function get_slot_context(definition, ctx, $$scope, fn) {
    return definition[1] && fn ? assign($$scope.ctx.slice(), definition[1](fn(ctx))) : $$scope.ctx;
  }
  function get_slot_changes(definition, $$scope, dirty, fn) {
    if (definition[2] && fn) {
      const lets = definition[2](fn(dirty));
      if ($$scope.dirty === void 0) {
        return lets;
      }
      if (typeof lets === "object") {
        const merged = [];
        const len = Math.max($$scope.dirty.length, lets.length);
        for (let i = 0; i < len; i += 1) {
          merged[i] = $$scope.dirty[i] | lets[i];
        }
        return merged;
      }
      return $$scope.dirty | lets;
    }
    return $$scope.dirty;
  }
  function update_slot_base(slot, slot_definition, ctx, $$scope, slot_changes, get_slot_context_fn) {
    if (slot_changes) {
      const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
      slot.p(slot_context, slot_changes);
    }
  }
  function get_all_dirty_from_scope($$scope) {
    if ($$scope.ctx.length > 32) {
      const dirty = [];
      const length = $$scope.ctx.length / 32;
      for (let i = 0; i < length; i++) {
        dirty[i] = -1;
      }
      return dirty;
    }
    return -1;
  }
  function exclude_internal_props(props) {
    const result = {};
    for (const k in props)
      if (k[0] !== "$")
        result[k] = props[k];
    return result;
  }
  function compute_rest_props(props, keys) {
    const rest = {};
    keys = new Set(keys);
    for (const k in props)
      if (!keys.has(k) && k[0] !== "$")
        rest[k] = props[k];
    return rest;
  }
  function compute_slots(slots) {
    const result = {};
    for (const key in slots) {
      result[key] = true;
    }
    return result;
  }

  // node_modules/svelte/src/runtime/internal/globals.js
  var globals = typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : (
    // @ts-ignore Node typings have this
    global
  );

  // node_modules/svelte/src/runtime/internal/ResizeObserverSingleton.js
  var ResizeObserverSingleton = class _ResizeObserverSingleton {
    /**
     * @private
     * @readonly
     * @type {WeakMap<Element, import('./private.js').Listener>}
     */
    _listeners = "WeakMap" in globals ? /* @__PURE__ */ new WeakMap() : void 0;
    /**
     * @private
     * @type {ResizeObserver}
     */
    _observer = void 0;
    /** @type {ResizeObserverOptions} */
    options;
    /** @param {ResizeObserverOptions} options */
    constructor(options) {
      this.options = options;
    }
    /**
     * @param {Element} element
     * @param {import('./private.js').Listener} listener
     * @returns {() => void}
     */
    observe(element2, listener) {
      this._listeners.set(element2, listener);
      this._getObserver().observe(element2, this.options);
      return () => {
        this._listeners.delete(element2);
        this._observer.unobserve(element2);
      };
    }
    /**
     * @private
     */
    _getObserver() {
      return this._observer ?? (this._observer = new ResizeObserver((entries) => {
        var _a;
        for (const entry of entries) {
          _ResizeObserverSingleton.entries.set(entry.target, entry);
          (_a = this._listeners.get(entry.target)) == null ? void 0 : _a(entry);
        }
      }));
    }
  };
  ResizeObserverSingleton.entries = "WeakMap" in globals ? /* @__PURE__ */ new WeakMap() : void 0;

  // node_modules/svelte/src/runtime/internal/dom.js
  var is_hydrating = false;
  function start_hydrating() {
    is_hydrating = true;
  }
  function end_hydrating() {
    is_hydrating = false;
  }
  function append(target, node) {
    target.appendChild(node);
  }
  function append_styles(target, style_sheet_id, styles) {
    const append_styles_to = get_root_for_style(target);
    if (!append_styles_to.getElementById(style_sheet_id)) {
      const style = element("style");
      style.id = style_sheet_id;
      style.textContent = styles;
      append_stylesheet(append_styles_to, style);
    }
  }
  function get_root_for_style(node) {
    if (!node)
      return document;
    const root2 = node.getRootNode ? node.getRootNode() : node.ownerDocument;
    if (root2 && /** @type {ShadowRoot} */
    root2.host) {
      return (
        /** @type {ShadowRoot} */
        root2
      );
    }
    return node.ownerDocument;
  }
  function append_stylesheet(node, style) {
    append(
      /** @type {Document} */
      node.head || node,
      style
    );
    return style.sheet;
  }
  function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
  }
  function detach(node) {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }
  function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
      if (iterations[i])
        iterations[i].d(detaching);
    }
  }
  function element(name) {
    return document.createElement(name);
  }
  function svg_element(name) {
    return document.createElementNS("http://www.w3.org/2000/svg", name);
  }
  function text(data) {
    return document.createTextNode(data);
  }
  function space() {
    return text(" ");
  }
  function empty() {
    return text("");
  }
  function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
  }
  function attr(node, attribute, value) {
    if (value == null)
      node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
      node.setAttribute(attribute, value);
  }
  function set_svg_attributes(node, attributes) {
    for (const key in attributes) {
      attr(node, key, attributes[key]);
    }
  }
  function children(element2) {
    return Array.from(element2.childNodes);
  }
  function set_data(text2, data) {
    data = "" + data;
    if (text2.data === data)
      return;
    text2.data = /** @type {string} */
    data;
  }
  function set_input_value(input, value) {
    input.value = value == null ? "" : value;
  }
  function set_style(node, key, value, important) {
    if (value == null) {
      node.style.removeProperty(key);
    } else {
      node.style.setProperty(key, value, important ? "important" : "");
    }
  }
  function select_option(select, value, mounting) {
    for (let i = 0; i < select.options.length; i += 1) {
      const option = select.options[i];
      if (option.__value === value) {
        option.selected = true;
        return;
      }
    }
    if (!mounting || value !== void 0) {
      select.selectedIndex = -1;
    }
  }
  function select_value(select) {
    const selected_option = select.querySelector(":checked");
    return selected_option && selected_option.__value;
  }
  function toggle_class(element2, name, toggle) {
    element2.classList.toggle(name, !!toggle);
  }
  function custom_event(type2, detail, { bubbles = false, cancelable = false } = {}) {
    return new CustomEvent(type2, { detail, bubbles, cancelable });
  }
  var HtmlTag = class {
    /**
     * @private
     * @default false
     */
    is_svg = false;
    /** parent for creating node */
    e = void 0;
    /** html tag nodes */
    n = void 0;
    /** target */
    t = void 0;
    /** anchor */
    a = void 0;
    constructor(is_svg = false) {
      this.is_svg = is_svg;
      this.e = this.n = null;
    }
    /**
     * @param {string} html
     * @returns {void}
     */
    c(html) {
      this.h(html);
    }
    /**
     * @param {string} html
     * @param {HTMLElement | SVGElement} target
     * @param {HTMLElement | SVGElement} anchor
     * @returns {void}
     */
    m(html, target, anchor = null) {
      if (!this.e) {
        if (this.is_svg)
          this.e = svg_element(
            /** @type {keyof SVGElementTagNameMap} */
            target.nodeName
          );
        else
          this.e = element(
            /** @type {keyof HTMLElementTagNameMap} */
            target.nodeType === 11 ? "TEMPLATE" : target.nodeName
          );
        this.t = target.tagName !== "TEMPLATE" ? target : (
          /** @type {HTMLTemplateElement} */
          target.content
        );
        this.c(html);
      }
      this.i(anchor);
    }
    /**
     * @param {string} html
     * @returns {void}
     */
    h(html) {
      this.e.innerHTML = html;
      this.n = Array.from(
        this.e.nodeName === "TEMPLATE" ? this.e.content.childNodes : this.e.childNodes
      );
    }
    /**
     * @returns {void} */
    i(anchor) {
      for (let i = 0; i < this.n.length; i += 1) {
        insert(this.t, this.n[i], anchor);
      }
    }
    /**
     * @param {string} html
     * @returns {void}
     */
    p(html) {
      this.d();
      this.h(html);
      this.i(this.a);
    }
    /**
     * @returns {void} */
    d() {
      this.n.forEach(detach);
    }
  };
  function get_custom_elements_slots(element2) {
    const result = {};
    element2.childNodes.forEach(
      /** @param {Element} node */
      (node) => {
        result[node.slot || "default"] = true;
      }
    );
    return result;
  }
  function construct_svelte_component(component, props) {
    return new component(props);
  }

  // node_modules/svelte/src/runtime/internal/lifecycle.js
  var current_component;
  function set_current_component(component) {
    current_component = component;
  }
  function get_current_component() {
    if (!current_component)
      throw new Error("Function called outside component initialization");
    return current_component;
  }
  function onMount(fn) {
    get_current_component().$$.on_mount.push(fn);
  }
  function onDestroy(fn) {
    get_current_component().$$.on_destroy.push(fn);
  }
  function createEventDispatcher() {
    const component = get_current_component();
    return (type2, detail, { cancelable = false } = {}) => {
      const callbacks = component.$$.callbacks[type2];
      if (callbacks) {
        const event = custom_event(
          /** @type {string} */
          type2,
          detail,
          { cancelable }
        );
        callbacks.slice().forEach((fn) => {
          fn.call(component, event);
        });
        return !event.defaultPrevented;
      }
      return true;
    };
  }

  // node_modules/svelte/src/runtime/internal/scheduler.js
  var dirty_components = [];
  var binding_callbacks = [];
  var render_callbacks = [];
  var flush_callbacks = [];
  var resolved_promise = /* @__PURE__ */ Promise.resolve();
  var update_scheduled = false;
  function schedule_update() {
    if (!update_scheduled) {
      update_scheduled = true;
      resolved_promise.then(flush);
    }
  }
  function add_render_callback(fn) {
    render_callbacks.push(fn);
  }
  function add_flush_callback(fn) {
    flush_callbacks.push(fn);
  }
  var seen_callbacks = /* @__PURE__ */ new Set();
  var flushidx = 0;
  function flush() {
    if (flushidx !== 0) {
      return;
    }
    const saved_component = current_component;
    do {
      try {
        while (flushidx < dirty_components.length) {
          const component = dirty_components[flushidx];
          flushidx++;
          set_current_component(component);
          update(component.$$);
        }
      } catch (e) {
        dirty_components.length = 0;
        flushidx = 0;
        throw e;
      }
      set_current_component(null);
      dirty_components.length = 0;
      flushidx = 0;
      while (binding_callbacks.length)
        binding_callbacks.pop()();
      for (let i = 0; i < render_callbacks.length; i += 1) {
        const callback = render_callbacks[i];
        if (!seen_callbacks.has(callback)) {
          seen_callbacks.add(callback);
          callback();
        }
      }
      render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
      flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
  }
  function update($$) {
    if ($$.fragment !== null) {
      $$.update();
      run_all($$.before_update);
      const dirty = $$.dirty;
      $$.dirty = [-1];
      $$.fragment && $$.fragment.p($$.ctx, dirty);
      $$.after_update.forEach(add_render_callback);
    }
  }
  function flush_render_callbacks(fns) {
    const filtered = [];
    const targets = [];
    render_callbacks.forEach((c2) => fns.indexOf(c2) === -1 ? filtered.push(c2) : targets.push(c2));
    targets.forEach((c2) => c2());
    render_callbacks = filtered;
  }

  // node_modules/svelte/src/runtime/internal/transitions.js
  var outroing = /* @__PURE__ */ new Set();
  var outros;
  function group_outros() {
    outros = {
      r: 0,
      c: [],
      p: outros
      // parent group
    };
  }
  function check_outros() {
    if (!outros.r) {
      run_all(outros.c);
    }
    outros = outros.p;
  }
  function transition_in(block, local) {
    if (block && block.i) {
      outroing.delete(block);
      block.i(local);
    }
  }
  function transition_out(block, local, detach2, callback) {
    if (block && block.o) {
      if (outroing.has(block))
        return;
      outroing.add(block);
      outros.c.push(() => {
        outroing.delete(block);
        if (callback) {
          if (detach2)
            block.d(1);
          callback();
        }
      });
      block.o(local);
    } else if (callback) {
      callback();
    }
  }

  // node_modules/svelte/src/runtime/internal/each.js
  function ensure_array_like(array_like_or_iterator) {
    return (array_like_or_iterator == null ? void 0 : array_like_or_iterator.length) !== void 0 ? array_like_or_iterator : Array.from(array_like_or_iterator);
  }
  function destroy_block(block, lookup) {
    block.d(1);
    lookup.delete(block.key);
  }
  function outro_and_destroy_block(block, lookup) {
    transition_out(block, 1, 1, () => {
      lookup.delete(block.key);
    });
  }
  function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block11, next, get_context) {
    let o = old_blocks.length;
    let n = list.length;
    let i = o;
    const old_indexes = {};
    while (i--)
      old_indexes[old_blocks[i].key] = i;
    const new_blocks = [];
    const new_lookup = /* @__PURE__ */ new Map();
    const deltas = /* @__PURE__ */ new Map();
    const updates = [];
    i = n;
    while (i--) {
      const child_ctx = get_context(ctx, list, i);
      const key = get_key(child_ctx);
      let block = lookup.get(key);
      if (!block) {
        block = create_each_block11(key, child_ctx);
        block.c();
      } else if (dynamic) {
        updates.push(() => block.p(child_ctx, dirty));
      }
      new_lookup.set(key, new_blocks[i] = block);
      if (key in old_indexes)
        deltas.set(key, Math.abs(i - old_indexes[key]));
    }
    const will_move = /* @__PURE__ */ new Set();
    const did_move = /* @__PURE__ */ new Set();
    function insert2(block) {
      transition_in(block, 1);
      block.m(node, next);
      lookup.set(block.key, block);
      next = block.first;
      n--;
    }
    while (o && n) {
      const new_block = new_blocks[n - 1];
      const old_block = old_blocks[o - 1];
      const new_key = new_block.key;
      const old_key = old_block.key;
      if (new_block === old_block) {
        next = new_block.first;
        o--;
        n--;
      } else if (!new_lookup.has(old_key)) {
        destroy(old_block, lookup);
        o--;
      } else if (!lookup.has(new_key) || will_move.has(new_key)) {
        insert2(new_block);
      } else if (did_move.has(old_key)) {
        o--;
      } else if (deltas.get(new_key) > deltas.get(old_key)) {
        did_move.add(new_key);
        insert2(new_block);
      } else {
        will_move.add(old_key);
        o--;
      }
    }
    while (o--) {
      const old_block = old_blocks[o];
      if (!new_lookup.has(old_block.key))
        destroy(old_block, lookup);
    }
    while (n)
      insert2(new_blocks[n - 1]);
    run_all(updates);
    return new_blocks;
  }

  // node_modules/svelte/src/runtime/internal/spread.js
  function get_spread_update(levels, updates) {
    const update2 = {};
    const to_null_out = {};
    const accounted_for = { $$scope: 1 };
    let i = levels.length;
    while (i--) {
      const o = levels[i];
      const n = updates[i];
      if (n) {
        for (const key in o) {
          if (!(key in n))
            to_null_out[key] = 1;
        }
        for (const key in n) {
          if (!accounted_for[key]) {
            update2[key] = n[key];
            accounted_for[key] = 1;
          }
        }
        levels[i] = n;
      } else {
        for (const key in o) {
          accounted_for[key] = 1;
        }
      }
    }
    for (const key in to_null_out) {
      if (!(key in update2))
        update2[key] = void 0;
    }
    return update2;
  }
  function get_spread_object(spread_props) {
    return typeof spread_props === "object" && spread_props !== null ? spread_props : {};
  }

  // node_modules/svelte/src/shared/boolean_attributes.js
  var _boolean_attributes = (
    /** @type {const} */
    [
      "allowfullscreen",
      "allowpaymentrequest",
      "async",
      "autofocus",
      "autoplay",
      "checked",
      "controls",
      "default",
      "defer",
      "disabled",
      "formnovalidate",
      "hidden",
      "inert",
      "ismap",
      "loop",
      "multiple",
      "muted",
      "nomodule",
      "novalidate",
      "open",
      "playsinline",
      "readonly",
      "required",
      "reversed",
      "selected"
    ]
  );
  var boolean_attributes = /* @__PURE__ */ new Set([..._boolean_attributes]);

  // node_modules/svelte/src/runtime/internal/Component.js
  function bind(component, name, callback) {
    const index2 = component.$$.props[name];
    if (index2 !== void 0) {
      component.$$.bound[index2] = callback;
      callback(component.$$.ctx[index2]);
    }
  }
  function create_component(block) {
    block && block.c();
  }
  function mount_component(component, target, anchor) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    add_render_callback(() => {
      const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
      if (component.$$.on_destroy) {
        component.$$.on_destroy.push(...new_on_destroy);
      } else {
        run_all(new_on_destroy);
      }
      component.$$.on_mount = [];
    });
    after_update.forEach(add_render_callback);
  }
  function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
      flush_render_callbacks($$.after_update);
      run_all($$.on_destroy);
      $$.fragment && $$.fragment.d(detaching);
      $$.on_destroy = $$.fragment = null;
      $$.ctx = [];
    }
  }
  function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
      dirty_components.push(component);
      schedule_update();
      component.$$.dirty.fill(0);
    }
    component.$$.dirty[i / 31 | 0] |= 1 << i % 31;
  }
  function init(component, options, instance49, create_fragment49, not_equal, props, append_styles2 = null, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
      fragment: null,
      ctx: [],
      // state
      props,
      update: noop,
      not_equal,
      bound: blank_object(),
      // lifecycle
      on_mount: [],
      on_destroy: [],
      on_disconnect: [],
      before_update: [],
      after_update: [],
      context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
      // everything else
      callbacks: blank_object(),
      dirty,
      skip_bound: false,
      root: options.target || parent_component.$$.root
    };
    append_styles2 && append_styles2($$.root);
    let ready = false;
    $$.ctx = instance49 ? instance49(component, options.props || {}, (i, ret, ...rest) => {
      const value = rest.length ? rest[0] : ret;
      if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
        if (!$$.skip_bound && $$.bound[i])
          $$.bound[i](value);
        if (ready)
          make_dirty(component, i);
      }
      return ret;
    }) : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    $$.fragment = create_fragment49 ? create_fragment49($$.ctx) : false;
    if (options.target) {
      if (options.hydrate) {
        start_hydrating();
        const nodes = children(options.target);
        $$.fragment && $$.fragment.l(nodes);
        nodes.forEach(detach);
      } else {
        $$.fragment && $$.fragment.c();
      }
      if (options.intro)
        transition_in(component.$$.fragment);
      mount_component(component, options.target, options.anchor);
      end_hydrating();
      flush();
    }
    set_current_component(parent_component);
  }
  var SvelteElement;
  if (typeof HTMLElement === "function") {
    SvelteElement = class extends HTMLElement {
      /** The Svelte component constructor */
      $$ctor;
      /** Slots */
      $$s;
      /** The Svelte component instance */
      $$c;
      /** Whether or not the custom element is connected */
      $$cn = false;
      /** Component props data */
      $$d = {};
      /** `true` if currently in the process of reflecting component props back to attributes */
      $$r = false;
      /** @type {Record<string, CustomElementPropDefinition>} Props definition (name, reflected, type etc) */
      $$p_d = {};
      /** @type {Record<string, Function[]>} Event listeners */
      $$l = {};
      /** @type {Map<Function, Function>} Event listener unsubscribe functions */
      $$l_u = /* @__PURE__ */ new Map();
      constructor($$componentCtor, $$slots, use_shadow_dom) {
        super();
        this.$$ctor = $$componentCtor;
        this.$$s = $$slots;
        if (use_shadow_dom) {
          this.attachShadow({ mode: "open" });
        }
      }
      addEventListener(type2, listener, options) {
        this.$$l[type2] = this.$$l[type2] || [];
        this.$$l[type2].push(listener);
        if (this.$$c) {
          const unsub = this.$$c.$on(type2, listener);
          this.$$l_u.set(listener, unsub);
        }
        super.addEventListener(type2, listener, options);
      }
      removeEventListener(type2, listener, options) {
        super.removeEventListener(type2, listener, options);
        if (this.$$c) {
          const unsub = this.$$l_u.get(listener);
          if (unsub) {
            unsub();
            this.$$l_u.delete(listener);
          }
        }
        if (this.$$l[type2]) {
          const idx = this.$$l[type2].indexOf(listener);
          if (idx >= 0) {
            this.$$l[type2].splice(idx, 1);
          }
        }
      }
      async connectedCallback() {
        this.$$cn = true;
        if (!this.$$c) {
          let create_slot2 = function(name) {
            return () => {
              let node;
              const obj = {
                c: function create2() {
                  node = element("slot");
                  if (name !== "default") {
                    attr(node, "name", name);
                  }
                },
                /**
                 * @param {HTMLElement} target
                 * @param {HTMLElement} [anchor]
                 */
                m: function mount(target, anchor) {
                  insert(target, node, anchor);
                },
                d: function destroy(detaching) {
                  if (detaching) {
                    detach(node);
                  }
                }
              };
              return obj;
            };
          };
          await Promise.resolve();
          if (!this.$$cn || this.$$c) {
            return;
          }
          const $$slots = {};
          const existing_slots = get_custom_elements_slots(this);
          for (const name of this.$$s) {
            if (name in existing_slots) {
              $$slots[name] = [create_slot2(name)];
            }
          }
          for (const attribute of this.attributes) {
            const name = this.$$g_p(attribute.name);
            if (!(name in this.$$d)) {
              this.$$d[name] = get_custom_element_value(name, attribute.value, this.$$p_d, "toProp");
            }
          }
          for (const key in this.$$p_d) {
            if (!(key in this.$$d) && this[key] !== void 0) {
              this.$$d[key] = this[key];
              delete this[key];
            }
          }
          this.$$c = new this.$$ctor({
            target: this.shadowRoot || this,
            props: {
              ...this.$$d,
              $$slots,
              $$scope: {
                ctx: []
              }
            }
          });
          const reflect_attributes = () => {
            this.$$r = true;
            for (const key in this.$$p_d) {
              this.$$d[key] = this.$$c.$$.ctx[this.$$c.$$.props[key]];
              if (this.$$p_d[key].reflect) {
                const attribute_value = get_custom_element_value(
                  key,
                  this.$$d[key],
                  this.$$p_d,
                  "toAttribute"
                );
                if (attribute_value == null) {
                  this.removeAttribute(this.$$p_d[key].attribute || key);
                } else {
                  this.setAttribute(this.$$p_d[key].attribute || key, attribute_value);
                }
              }
            }
            this.$$r = false;
          };
          this.$$c.$$.after_update.push(reflect_attributes);
          reflect_attributes();
          for (const type2 in this.$$l) {
            for (const listener of this.$$l[type2]) {
              const unsub = this.$$c.$on(type2, listener);
              this.$$l_u.set(listener, unsub);
            }
          }
          this.$$l = {};
        }
      }
      // We don't need this when working within Svelte code, but for compatibility of people using this outside of Svelte
      // and setting attributes through setAttribute etc, this is helpful
      attributeChangedCallback(attr2, _oldValue, newValue) {
        var _a;
        if (this.$$r)
          return;
        attr2 = this.$$g_p(attr2);
        this.$$d[attr2] = get_custom_element_value(attr2, newValue, this.$$p_d, "toProp");
        (_a = this.$$c) == null ? void 0 : _a.$set({ [attr2]: this.$$d[attr2] });
      }
      disconnectedCallback() {
        this.$$cn = false;
        Promise.resolve().then(() => {
          if (!this.$$cn && this.$$c) {
            this.$$c.$destroy();
            this.$$c = void 0;
          }
        });
      }
      $$g_p(attribute_name) {
        return Object.keys(this.$$p_d).find(
          (key) => this.$$p_d[key].attribute === attribute_name || !this.$$p_d[key].attribute && key.toLowerCase() === attribute_name
        ) || attribute_name;
      }
    };
  }
  function get_custom_element_value(prop, value, props_definition, transform2) {
    var _a;
    const type2 = (_a = props_definition[prop]) == null ? void 0 : _a.type;
    value = type2 === "Boolean" && typeof value !== "boolean" ? value != null : value;
    if (!transform2 || !props_definition[prop]) {
      return value;
    } else if (transform2 === "toAttribute") {
      switch (type2) {
        case "Object":
        case "Array":
          return value == null ? null : JSON.stringify(value);
        case "Boolean":
          return value ? "" : null;
        case "Number":
          return value == null ? null : value;
        default:
          return value;
      }
    } else {
      switch (type2) {
        case "Object":
        case "Array":
          return value && JSON.parse(value);
        case "Boolean":
          return value;
        case "Number":
          return value != null ? +value : value;
        default:
          return value;
      }
    }
  }
  var SvelteComponent = class {
    /**
     * ### PRIVATE API
     *
     * Do not use, may change at any time
     *
     * @type {any}
     */
    $$ = void 0;
    /**
     * ### PRIVATE API
     *
     * Do not use, may change at any time
     *
     * @type {any}
     */
    $$set = void 0;
    /** @returns {void} */
    $destroy() {
      destroy_component(this, 1);
      this.$destroy = noop;
    }
    /**
     * @template {Extract<keyof Events, string>} K
     * @param {K} type
     * @param {((e: Events[K]) => void) | null | undefined} callback
     * @returns {() => void}
     */
    $on(type2, callback) {
      if (!is_function(callback)) {
        return noop;
      }
      const callbacks = this.$$.callbacks[type2] || (this.$$.callbacks[type2] = []);
      callbacks.push(callback);
      return () => {
        const index2 = callbacks.indexOf(callback);
        if (index2 !== -1)
          callbacks.splice(index2, 1);
      };
    }
    /**
     * @param {Partial<Props>} props
     * @returns {void}
     */
    $set(props) {
      if (this.$$set && !is_empty(props)) {
        this.$$.skip_bound = true;
        this.$$set(props);
        this.$$.skip_bound = false;
      }
    }
  };

  // node_modules/svelte/src/shared/version.js
  var PUBLIC_VERSION = "4";

  // node_modules/svelte/src/runtime/internal/disclose-version/index.js
  if (typeof window !== "undefined")
    (window.__svelte || (window.__svelte = { v: /* @__PURE__ */ new Set() })).v.add(PUBLIC_VERSION);

  // node_modules/lucide-svelte/dist/defaultAttributes.js
  var defaultAttributes = {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  };
  var defaultAttributes_default = defaultAttributes;

  // node_modules/lucide-svelte/dist/utils/hasA11yProp.js
  var hasA11yProp = (props) => {
    for (const prop in props) {
      if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
        return true;
      }
    }
    return false;
  };

  // node_modules/lucide-svelte/dist/utils/mergeClasses.js
  var mergeClasses = (...classes) => classes.filter((className, index2, array2) => {
    return Boolean(className) && className.trim() !== "" && array2.indexOf(className) === index2;
  }).join(" ").trim();

  // node_modules/lucide-svelte/dist/Icon.svelte
  function get_each_context(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[10] = list[i][0];
    child_ctx[11] = list[i][1];
    return child_ctx;
  }
  function create_dynamic_element(ctx) {
    let svelte_element;
    let svelte_element_levels = [
      /*attrs*/
      ctx[11]
    ];
    let svelte_element_data = {};
    for (let i = 0; i < svelte_element_levels.length; i += 1) {
      svelte_element_data = assign(svelte_element_data, svelte_element_levels[i]);
    }
    return {
      c() {
        svelte_element = svg_element(
          /*tag*/
          ctx[10]
        );
        set_svg_attributes(svelte_element, svelte_element_data);
      },
      m(target, anchor) {
        insert(target, svelte_element, anchor);
      },
      p(ctx2, dirty) {
        set_svg_attributes(svelte_element, svelte_element_data = get_spread_update(svelte_element_levels, [dirty & /*iconNode*/
        32 && /*attrs*/
        ctx2[11]]));
      },
      d(detaching) {
        if (detaching) {
          detach(svelte_element);
        }
      }
    };
  }
  function create_each_block(ctx) {
    let previous_tag = (
      /*tag*/
      ctx[10]
    );
    let svelte_element_anchor;
    let svelte_element = (
      /*tag*/
      ctx[10] && create_dynamic_element(ctx)
    );
    return {
      c() {
        if (svelte_element)
          svelte_element.c();
        svelte_element_anchor = empty();
      },
      m(target, anchor) {
        if (svelte_element)
          svelte_element.m(target, anchor);
        insert(target, svelte_element_anchor, anchor);
      },
      p(ctx2, dirty) {
        if (
          /*tag*/
          ctx2[10]
        ) {
          if (!previous_tag) {
            svelte_element = create_dynamic_element(ctx2);
            previous_tag = /*tag*/
            ctx2[10];
            svelte_element.c();
            svelte_element.m(svelte_element_anchor.parentNode, svelte_element_anchor);
          } else if (safe_not_equal(
            previous_tag,
            /*tag*/
            ctx2[10]
          )) {
            svelte_element.d(1);
            svelte_element = create_dynamic_element(ctx2);
            previous_tag = /*tag*/
            ctx2[10];
            svelte_element.c();
            svelte_element.m(svelte_element_anchor.parentNode, svelte_element_anchor);
          } else {
            svelte_element.p(ctx2, dirty);
          }
        } else if (previous_tag) {
          svelte_element.d(1);
          svelte_element = null;
          previous_tag = /*tag*/
          ctx2[10];
        }
      },
      d(detaching) {
        if (detaching) {
          detach(svelte_element_anchor);
        }
        if (svelte_element)
          svelte_element.d(detaching);
      }
    };
  }
  function create_fragment(ctx) {
    let svg;
    let each_1_anchor;
    let svg_stroke_width_value;
    let svg_class_value;
    let current;
    let each_value = ensure_array_like(
      /*iconNode*/
      ctx[5]
    );
    let each_blocks = [];
    for (let i = 0; i < each_value.length; i += 1) {
      each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    }
    const default_slot_template = (
      /*#slots*/
      ctx[9].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[8],
      null
    );
    let svg_levels = [
      defaultAttributes_default,
      !hasA11yProp(
        /*$$restProps*/
        ctx[6]
      ) ? { "aria-hidden": "true" } : void 0,
      /*$$restProps*/
      ctx[6],
      { width: (
        /*size*/
        ctx[2]
      ) },
      { height: (
        /*size*/
        ctx[2]
      ) },
      { stroke: (
        /*color*/
        ctx[1]
      ) },
      {
        "stroke-width": svg_stroke_width_value = /*absoluteStrokeWidth*/
        ctx[4] ? Number(
          /*strokeWidth*/
          ctx[3]
        ) * 24 / Number(
          /*size*/
          ctx[2]
        ) : (
          /*strokeWidth*/
          ctx[3]
        )
      },
      {
        class: svg_class_value = mergeClasses(
          "lucide-icon",
          "lucide",
          /*name*/
          ctx[0] ? `lucide-${/*name*/
          ctx[0]}` : "",
          /*$$props*/
          ctx[7].class
        )
      }
    ];
    let svg_data = {};
    for (let i = 0; i < svg_levels.length; i += 1) {
      svg_data = assign(svg_data, svg_levels[i]);
    }
    return {
      c() {
        svg = svg_element("svg");
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        each_1_anchor = empty();
        if (default_slot)
          default_slot.c();
        set_svg_attributes(svg, svg_data);
      },
      m(target, anchor) {
        insert(target, svg, anchor);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(svg, null);
          }
        }
        append(svg, each_1_anchor);
        if (default_slot) {
          default_slot.m(svg, null);
        }
        current = true;
      },
      p(ctx2, [dirty]) {
        if (dirty & /*iconNode*/
        32) {
          each_value = ensure_array_like(
            /*iconNode*/
            ctx2[5]
          );
          let i;
          for (i = 0; i < each_value.length; i += 1) {
            const child_ctx = get_each_context(ctx2, each_value, i);
            if (each_blocks[i]) {
              each_blocks[i].p(child_ctx, dirty);
            } else {
              each_blocks[i] = create_each_block(child_ctx);
              each_blocks[i].c();
              each_blocks[i].m(svg, each_1_anchor);
            }
          }
          for (; i < each_blocks.length; i += 1) {
            each_blocks[i].d(1);
          }
          each_blocks.length = each_value.length;
        }
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          256)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[8],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[8]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[8],
                dirty,
                null
              ),
              null
            );
          }
        }
        set_svg_attributes(svg, svg_data = get_spread_update(svg_levels, [
          defaultAttributes_default,
          dirty & /*$$restProps*/
          64 && (!hasA11yProp(
            /*$$restProps*/
            ctx2[6]
          ) ? { "aria-hidden": "true" } : void 0),
          dirty & /*$$restProps*/
          64 && /*$$restProps*/
          ctx2[6],
          (!current || dirty & /*size*/
          4) && { width: (
            /*size*/
            ctx2[2]
          ) },
          (!current || dirty & /*size*/
          4) && { height: (
            /*size*/
            ctx2[2]
          ) },
          (!current || dirty & /*color*/
          2) && { stroke: (
            /*color*/
            ctx2[1]
          ) },
          (!current || dirty & /*absoluteStrokeWidth, strokeWidth, size*/
          28 && svg_stroke_width_value !== (svg_stroke_width_value = /*absoluteStrokeWidth*/
          ctx2[4] ? Number(
            /*strokeWidth*/
            ctx2[3]
          ) * 24 / Number(
            /*size*/
            ctx2[2]
          ) : (
            /*strokeWidth*/
            ctx2[3]
          ))) && { "stroke-width": svg_stroke_width_value },
          (!current || dirty & /*name, $$props*/
          129 && svg_class_value !== (svg_class_value = mergeClasses(
            "lucide-icon",
            "lucide",
            /*name*/
            ctx2[0] ? `lucide-${/*name*/
            ctx2[0]}` : "",
            /*$$props*/
            ctx2[7].class
          ))) && { class: svg_class_value }
        ]));
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(svg);
        }
        destroy_each(each_blocks, detaching);
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function instance($$self, $$props, $$invalidate) {
    const omit_props_names = ["name", "color", "size", "strokeWidth", "absoluteStrokeWidth", "iconNode"];
    let $$restProps = compute_rest_props($$props, omit_props_names);
    let { $$slots: slots = {}, $$scope } = $$props;
    let { name = void 0 } = $$props;
    let { color: color2 = "currentColor" } = $$props;
    let { size = 24 } = $$props;
    let { strokeWidth = 2 } = $$props;
    let { absoluteStrokeWidth = false } = $$props;
    let { iconNode = [] } = $$props;
    $$self.$$set = ($$new_props) => {
      $$invalidate(7, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      $$invalidate(6, $$restProps = compute_rest_props($$props, omit_props_names));
      if ("name" in $$new_props)
        $$invalidate(0, name = $$new_props.name);
      if ("color" in $$new_props)
        $$invalidate(1, color2 = $$new_props.color);
      if ("size" in $$new_props)
        $$invalidate(2, size = $$new_props.size);
      if ("strokeWidth" in $$new_props)
        $$invalidate(3, strokeWidth = $$new_props.strokeWidth);
      if ("absoluteStrokeWidth" in $$new_props)
        $$invalidate(4, absoluteStrokeWidth = $$new_props.absoluteStrokeWidth);
      if ("iconNode" in $$new_props)
        $$invalidate(5, iconNode = $$new_props.iconNode);
      if ("$$scope" in $$new_props)
        $$invalidate(8, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [
      name,
      color2,
      size,
      strokeWidth,
      absoluteStrokeWidth,
      iconNode,
      $$restProps,
      $$props,
      $$scope,
      slots
    ];
  }
  var Icon = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance, create_fragment, safe_not_equal, {
        name: 0,
        color: 1,
        size: 2,
        strokeWidth: 3,
        absoluteStrokeWidth: 4,
        iconNode: 5
      });
    }
  };
  var Icon_default = Icon;

  // node_modules/lucide-svelte/dist/icons/check.svelte
  function create_default_slot(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment2(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "check" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance2($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [["path", { "d": "M20 6 9 17l-5-5" }]];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Check = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance2, create_fragment2, safe_not_equal, {});
    }
  };
  var check_default = Check;

  // node_modules/lucide-svelte/dist/icons/circle-alert.svelte
  function create_default_slot2(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment3(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "circle-alert" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot2] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance3($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      ["circle", { "cx": "12", "cy": "12", "r": "10" }],
      [
        "line",
        {
          "x1": "12",
          "x2": "12",
          "y1": "8",
          "y2": "12"
        }
      ],
      [
        "line",
        {
          "x1": "12",
          "x2": "12.01",
          "y1": "16",
          "y2": "16"
        }
      ]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Circle_alert = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance3, create_fragment3, safe_not_equal, {});
    }
  };
  var circle_alert_default = Circle_alert;

  // node_modules/lucide-svelte/dist/icons/ellipsis-vertical.svelte
  function create_default_slot3(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment4(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "ellipsis-vertical" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot3] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance4($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      ["circle", { "cx": "12", "cy": "12", "r": "1" }],
      ["circle", { "cx": "12", "cy": "5", "r": "1" }],
      ["circle", { "cx": "12", "cy": "19", "r": "1" }]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Ellipsis_vertical = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance4, create_fragment4, safe_not_equal, {});
    }
  };
  var ellipsis_vertical_default = Ellipsis_vertical;

  // node_modules/lucide-svelte/dist/icons/eye.svelte
  function create_default_slot4(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment5(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "eye" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot4] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance5($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
        }
      ],
      ["circle", { "cx": "12", "cy": "12", "r": "3" }]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Eye = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance5, create_fragment5, safe_not_equal, {});
    }
  };
  var eye_default = Eye;

  // node_modules/lucide-svelte/dist/icons/folder-key.svelte
  function create_default_slot5(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment6(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "folder-key" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot5] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance6($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M13 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v1.36"
        }
      ],
      ["path", { "d": "M19 12v6" }],
      ["path", { "d": "M19 14h2" }],
      ["circle", { "cx": "19", "cy": "20", "r": "2" }]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Folder_key = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance6, create_fragment6, safe_not_equal, {});
    }
  };
  var folder_key_default = Folder_key;

  // node_modules/lucide-svelte/dist/icons/folder-plus.svelte
  function create_default_slot6(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment7(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "folder-plus" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot6] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance7($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      ["path", { "d": "M12 10v6" }],
      ["path", { "d": "M9 13h6" }],
      [
        "path",
        {
          "d": "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
        }
      ]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Folder_plus = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance7, create_fragment7, safe_not_equal, {});
    }
  };
  var folder_plus_default = Folder_plus;

  // node_modules/lucide-svelte/dist/icons/folder.svelte
  function create_default_slot7(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment8(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "folder" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot7] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance8($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
        }
      ]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Folder = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance8, create_fragment8, safe_not_equal, {});
    }
  };
  var folder_default = Folder;

  // node_modules/lucide-svelte/dist/icons/list-checks.svelte
  function create_default_slot8(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment9(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "list-checks" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot8] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance9($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      ["path", { "d": "M13 5h8" }],
      ["path", { "d": "M13 12h8" }],
      ["path", { "d": "M13 19h8" }],
      ["path", { "d": "m3 17 2 2 4-4" }],
      ["path", { "d": "m3 7 2 2 4-4" }]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var List_checks = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance9, create_fragment9, safe_not_equal, {});
    }
  };
  var list_checks_default = List_checks;

  // node_modules/lucide-svelte/dist/icons/pen-line.svelte
  function create_default_slot9(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment10(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "pen-line" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot9] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance10($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      ["path", { "d": "M13 21h8" }],
      [
        "path",
        {
          "d": "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
        }
      ]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Pen_line = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance10, create_fragment10, safe_not_equal, {});
    }
  };
  var pen_line_default = Pen_line;

  // node_modules/lucide-svelte/dist/icons/pen.svelte
  function create_default_slot10(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment11(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "pen" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot10] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance11($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
        }
      ]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Pen = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance11, create_fragment11, safe_not_equal, {});
    }
  };
  var pen_default = Pen;

  // node_modules/lucide-svelte/dist/icons/pencil.svelte
  function create_default_slot11(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment12(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "pencil" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot11] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance12($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
        }
      ],
      ["path", { "d": "m15 5 4 4" }]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Pencil = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance12, create_fragment12, safe_not_equal, {});
    }
  };
  var pencil_default = Pencil;

  // node_modules/lucide-svelte/dist/icons/plus.svelte
  function create_default_slot12(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment13(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "plus" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot12] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance13($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [["path", { "d": "M5 12h14" }], ["path", { "d": "M12 5v14" }]];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Plus = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance13, create_fragment13, safe_not_equal, {});
    }
  };
  var plus_default = Plus;

  // node_modules/lucide-svelte/dist/icons/ribbon.svelte
  function create_default_slot13(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment14(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "ribbon" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot13] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance14($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M12 11.22C11 9.997 10 9 10 8a2 2 0 0 1 4 0c0 1-.998 2.002-2.01 3.22"
        }
      ],
      ["path", { "d": "m12 18 2.57-3.5" }],
      [
        "path",
        {
          "d": "M6.243 9.016a7 7 0 0 1 11.507-.009"
        }
      ],
      ["path", { "d": "M9.35 14.53 12 11.22" }],
      [
        "path",
        {
          "d": "M9.35 14.53C7.728 12.246 6 10.221 6 7a6 5 0 0 1 12 0c-.005 3.22-1.778 5.235-3.43 7.5l3.557 4.527a1 1 0 0 1-.203 1.43l-1.894 1.36a1 1 0 0 1-1.384-.215L12 18l-2.679 3.593a1 1 0 0 1-1.39.213l-1.865-1.353a1 1 0 0 1-.203-1.422z"
        }
      ]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Ribbon = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance14, create_fragment14, safe_not_equal, {});
    }
  };
  var ribbon_default = Ribbon;

  // node_modules/lucide-svelte/dist/icons/search.svelte
  function create_default_slot14(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment15(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "search" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot14] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance15($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      ["path", { "d": "m21 21-4.34-4.34" }],
      ["circle", { "cx": "11", "cy": "11", "r": "8" }]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Search = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance15, create_fragment15, safe_not_equal, {});
    }
  };
  var search_default = Search;

  // node_modules/lucide-svelte/dist/icons/settings.svelte
  function create_default_slot15(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment16(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "settings" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot15] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance16($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
        }
      ],
      ["circle", { "cx": "12", "cy": "12", "r": "3" }]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Settings = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance16, create_fragment16, safe_not_equal, {});
    }
  };
  var settings_default = Settings;

  // node_modules/lucide-svelte/dist/icons/shield.svelte
  function create_default_slot16(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment17(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "shield" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot16] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance17($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
        }
      ]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Shield = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance17, create_fragment17, safe_not_equal, {});
    }
  };
  var shield_default = Shield;

  // node_modules/lucide-svelte/dist/icons/square-menu.svelte
  function create_default_slot17(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment18(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "square-menu" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot17] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance18($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      [
        "rect",
        {
          "width": "18",
          "height": "18",
          "x": "3",
          "y": "3",
          "rx": "2"
        }
      ],
      ["path", { "d": "M7 8h10" }],
      ["path", { "d": "M7 12h10" }],
      ["path", { "d": "M7 16h10" }]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Square_menu = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance18, create_fragment18, safe_not_equal, {});
    }
  };
  var square_menu_default = Square_menu;

  // node_modules/lucide-svelte/dist/icons/square-pen.svelte
  function create_default_slot18(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment19(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "square-pen" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot18] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance19($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
        }
      ],
      [
        "path",
        {
          "d": "M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"
        }
      ]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Square_pen = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance19, create_fragment19, safe_not_equal, {});
    }
  };
  var square_pen_default = Square_pen;

  // node_modules/lucide-svelte/dist/icons/square-plus.svelte
  function create_default_slot19(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment20(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "square-plus" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot19] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance20($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      [
        "rect",
        {
          "width": "18",
          "height": "18",
          "x": "3",
          "y": "3",
          "rx": "2"
        }
      ],
      ["path", { "d": "M8 12h8" }],
      ["path", { "d": "M12 8v8" }]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Square_plus = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance20, create_fragment20, safe_not_equal, {});
    }
  };
  var square_plus_default = Square_plus;

  // node_modules/lucide-svelte/dist/icons/trash-2.svelte
  function create_default_slot20(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment21(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "trash-2" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot20] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance21($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      ["path", { "d": "M10 11v6" }],
      ["path", { "d": "M14 11v6" }],
      [
        "path",
        {
          "d": "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
        }
      ],
      ["path", { "d": "M3 6h18" }],
      [
        "path",
        {
          "d": "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
        }
      ]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Trash_2 = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance21, create_fragment21, safe_not_equal, {});
    }
  };
  var trash_2_default = Trash_2;

  // node_modules/lucide-svelte/dist/icons/trash.svelte
  function create_default_slot21(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment22(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "trash" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot21] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance22($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
        }
      ],
      ["path", { "d": "M3 6h18" }],
      [
        "path",
        {
          "d": "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
        }
      ]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Trash = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance22, create_fragment22, safe_not_equal, {});
    }
  };
  var trash_default = Trash;

  // node_modules/lucide-svelte/dist/icons/user-plus.svelte
  function create_default_slot22(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment23(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "user-plus" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot22] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance23($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
        }
      ],
      ["circle", { "cx": "9", "cy": "7", "r": "4" }],
      [
        "line",
        {
          "x1": "19",
          "x2": "19",
          "y1": "8",
          "y2": "14"
        }
      ],
      [
        "line",
        {
          "x1": "22",
          "x2": "16",
          "y1": "11",
          "y2": "11"
        }
      ]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var User_plus = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance23, create_fragment23, safe_not_equal, {});
    }
  };
  var user_plus_default = User_plus;

  // node_modules/lucide-svelte/dist/icons/users.svelte
  function create_default_slot23(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment24(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "users" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot23] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance24($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
        }
      ],
      ["path", { "d": "M16 3.128a4 4 0 0 1 0 7.744" }],
      ["path", { "d": "M22 21v-2a4 4 0 0 0-3-3.87" }],
      ["circle", { "cx": "9", "cy": "7", "r": "4" }]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Users = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance24, create_fragment24, safe_not_equal, {});
    }
  };
  var users_default = Users;

  // node_modules/lucide-svelte/dist/icons/vault.svelte
  function create_default_slot24(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment25(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "vault" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot24] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance25($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [
      [
        "rect",
        {
          "width": "18",
          "height": "18",
          "x": "3",
          "y": "3",
          "rx": "2"
        }
      ],
      [
        "circle",
        {
          "cx": "7.5",
          "cy": "7.5",
          "r": ".5",
          "fill": "currentColor"
        }
      ],
      ["path", { "d": "m7.9 7.9 2.7 2.7" }],
      [
        "circle",
        {
          "cx": "16.5",
          "cy": "7.5",
          "r": ".5",
          "fill": "currentColor"
        }
      ],
      ["path", { "d": "m13.4 10.6 2.7-2.7" }],
      [
        "circle",
        {
          "cx": "7.5",
          "cy": "16.5",
          "r": ".5",
          "fill": "currentColor"
        }
      ],
      ["path", { "d": "m7.9 16.1 2.7-2.7" }],
      [
        "circle",
        {
          "cx": "16.5",
          "cy": "16.5",
          "r": ".5",
          "fill": "currentColor"
        }
      ],
      ["path", { "d": "m13.4 13.4 2.7 2.7" }],
      ["circle", { "cx": "12", "cy": "12", "r": "2" }]
    ];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var Vault = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance25, create_fragment25, safe_not_equal, {});
    }
  };
  var vault_default = Vault;

  // node_modules/lucide-svelte/dist/icons/x.svelte
  function create_default_slot25(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[2].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[3],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          8)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[3],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[3]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[3],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_fragment26(ctx) {
    let icon;
    let current;
    const icon_spread_levels = [
      { name: "x" },
      /*$$props*/
      ctx[1],
      { iconNode: (
        /*iconNode*/
        ctx[0]
      ) }
    ];
    let icon_props = {
      $$slots: { default: [create_default_slot25] },
      $$scope: { ctx }
    };
    for (let i = 0; i < icon_spread_levels.length; i += 1) {
      icon_props = assign(icon_props, icon_spread_levels[i]);
    }
    icon = new Icon_default({ props: icon_props });
    return {
      c() {
        create_component(icon.$$.fragment);
      },
      m(target, anchor) {
        mount_component(icon, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const icon_changes = dirty & /*$$props, iconNode*/
        3 ? get_spread_update(icon_spread_levels, [
          icon_spread_levels[0],
          dirty & /*$$props*/
          2 && get_spread_object(
            /*$$props*/
            ctx2[1]
          ),
          dirty & /*iconNode*/
          1 && { iconNode: (
            /*iconNode*/
            ctx2[0]
          ) }
        ]) : {};
        if (dirty & /*$$scope*/
        8) {
          icon_changes.$$scope = { dirty, ctx: ctx2 };
        }
        icon.$set(icon_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(icon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(icon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(icon, detaching);
      }
    };
  }
  function instance26($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const iconNode = [["path", { "d": "M18 6 6 18" }], ["path", { "d": "m6 6 12 12" }]];
    $$self.$$set = ($$new_props) => {
      $$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
      if ("$$scope" in $$new_props)
        $$invalidate(3, $$scope = $$new_props.$$scope);
    };
    $$props = exclude_internal_props($$props);
    return [iconNode, $$props, slots, $$scope];
  }
  var X = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance26, create_fragment26, safe_not_equal, {});
    }
  };
  var x_default = X;

  // packages/ui/src/components/layout/Banner.svelte
  function add_css(target) {
    append_styles(target, "svelte-mnfkgx", '.banner.svelte-mnfkgx{position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;align-items:center;gap:0.75rem;padding:0.625rem 1rem;font-family:var(\r\n      --font-interface,\r\n      -apple-system,\r\n      BlinkMacSystemFont,\r\n      "Segoe UI",\r\n      sans-serif\r\n    );font-size:0.8125rem;line-height:1.45;box-shadow:0 1px 6px rgba(0, 0, 0, 0.4);user-select:text;-webkit-user-select:text}.banner-body.svelte-mnfkgx{flex:1}.banner-title.svelte-mnfkgx{display:block;font-weight:600}.banner-close.svelte-mnfkgx{flex-shrink:0;align-self:flex-start;display:flex;align-items:center;background:none;border:none;box-shadow:none;color:inherit;opacity:0.8;cursor:pointer;padding:0.25rem;border-radius:0.25rem}.banner-close.svelte-mnfkgx:hover{opacity:1;background:rgba(0, 0, 0, 0.2)}.error.svelte-mnfkgx{background:#5c1a1a;color:#f3d6d6;border-bottom:1px solid #7a2a2a}.warning.svelte-mnfkgx{background:#5c4410;color:#f3e6c0;border-bottom:1px solid #7a5e1a}.info.svelte-mnfkgx{background:#13304d;color:#cfe2f3;border-bottom:1px solid #1d4a73}');
  }
  function create_if_block_1(ctx) {
    let strong;
    let t;
    return {
      c() {
        strong = element("strong");
        t = text(
          /*title*/
          ctx[2]
        );
        attr(strong, "class", "banner-title svelte-mnfkgx");
      },
      m(target, anchor) {
        insert(target, strong, anchor);
        append(strong, t);
      },
      p(ctx2, dirty) {
        if (dirty & /*title*/
        4)
          set_data(
            t,
            /*title*/
            ctx2[2]
          );
      },
      d(detaching) {
        if (detaching) {
          detach(strong);
        }
      }
    };
  }
  function create_if_block(ctx) {
    let button;
    let x3;
    let current;
    let mounted;
    let dispose;
    x3 = new x_default({ props: { size: "1.125rem" } });
    return {
      c() {
        button = element("button");
        create_component(x3.$$.fragment);
        attr(button, "class", "banner-close svelte-mnfkgx");
        attr(button, "aria-label", "Dismiss");
        attr(button, "title", "Dismiss");
      },
      m(target, anchor) {
        insert(target, button, anchor);
        mount_component(x3, button, null);
        current = true;
        if (!mounted) {
          dispose = listen(
            button,
            "click",
            /*dismiss*/
            ctx[4]
          );
          mounted = true;
        }
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(x3.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(x3.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(button);
        }
        destroy_component(x3);
        mounted = false;
        dispose();
      }
    };
  }
  function create_fragment27(ctx) {
    let div1;
    let div0;
    let t0;
    let t1;
    let div1_class_value;
    let current;
    let if_block0 = (
      /*title*/
      ctx[2] && create_if_block_1(ctx)
    );
    const default_slot_template = (
      /*#slots*/
      ctx[6].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[5],
      null
    );
    let if_block1 = (
      /*dismissible*/
      ctx[1] && create_if_block(ctx)
    );
    return {
      c() {
        div1 = element("div");
        div0 = element("div");
        if (if_block0)
          if_block0.c();
        t0 = space();
        if (default_slot)
          default_slot.c();
        t1 = space();
        if (if_block1)
          if_block1.c();
        attr(div0, "class", "banner-body svelte-mnfkgx");
        attr(div1, "class", div1_class_value = "banner " + /*severity*/
        ctx[0] + " svelte-mnfkgx");
        attr(
          div1,
          "id",
          /*id*/
          ctx[3]
        );
        attr(div1, "role", "alert");
      },
      m(target, anchor) {
        insert(target, div1, anchor);
        append(div1, div0);
        if (if_block0)
          if_block0.m(div0, null);
        append(div0, t0);
        if (default_slot) {
          default_slot.m(div0, null);
        }
        append(div1, t1);
        if (if_block1)
          if_block1.m(div1, null);
        current = true;
      },
      p(ctx2, [dirty]) {
        if (
          /*title*/
          ctx2[2]
        ) {
          if (if_block0) {
            if_block0.p(ctx2, dirty);
          } else {
            if_block0 = create_if_block_1(ctx2);
            if_block0.c();
            if_block0.m(div0, t0);
          }
        } else if (if_block0) {
          if_block0.d(1);
          if_block0 = null;
        }
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          32)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[5],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[5]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[5],
                dirty,
                null
              ),
              null
            );
          }
        }
        if (
          /*dismissible*/
          ctx2[1]
        ) {
          if (if_block1) {
            if_block1.p(ctx2, dirty);
            if (dirty & /*dismissible*/
            2) {
              transition_in(if_block1, 1);
            }
          } else {
            if_block1 = create_if_block(ctx2);
            if_block1.c();
            transition_in(if_block1, 1);
            if_block1.m(div1, null);
          }
        } else if (if_block1) {
          group_outros();
          transition_out(if_block1, 1, 1, () => {
            if_block1 = null;
          });
          check_outros();
        }
        if (!current || dirty & /*severity*/
        1 && div1_class_value !== (div1_class_value = "banner " + /*severity*/
        ctx2[0] + " svelte-mnfkgx")) {
          attr(div1, "class", div1_class_value);
        }
        if (!current || dirty & /*id*/
        8) {
          attr(
            div1,
            "id",
            /*id*/
            ctx2[3]
          );
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        transition_in(if_block1);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        transition_out(if_block1);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div1);
        }
        if (if_block0)
          if_block0.d();
        if (default_slot)
          default_slot.d(detaching);
        if (if_block1)
          if_block1.d();
      }
    };
  }
  function instance27($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    let { severity = "info" } = $$props;
    let { dismissible = true } = $$props;
    let { title = "" } = $$props;
    let { id: id2 = void 0 } = $$props;
    const dispatch2 = createEventDispatcher();
    function dismiss() {
      dispatch2("dismiss");
    }
    $$self.$$set = ($$props2) => {
      if ("severity" in $$props2)
        $$invalidate(0, severity = $$props2.severity);
      if ("dismissible" in $$props2)
        $$invalidate(1, dismissible = $$props2.dismissible);
      if ("title" in $$props2)
        $$invalidate(2, title = $$props2.title);
      if ("id" in $$props2)
        $$invalidate(3, id2 = $$props2.id);
      if ("$$scope" in $$props2)
        $$invalidate(5, $$scope = $$props2.$$scope);
    };
    return [severity, dismissible, title, id2, dismiss, $$scope, slots];
  }
  var Banner = class extends SvelteComponent {
    constructor(options) {
      super();
      init(
        this,
        options,
        instance27,
        create_fragment27,
        safe_not_equal,
        {
          severity: 0,
          dismissible: 1,
          title: 2,
          id: 3
        },
        add_css
      );
    }
  };
  var Banner_default = Banner;

  // packages/ui/src/components/layout/InsecureContextNotice.svelte
  function add_css2(target) {
    append_styles(target, "svelte-1dg3wqp", ".detail.svelte-1dg3wqp{margin-top:0.25rem}.fix.svelte-1dg3wqp{margin-top:0.375rem}code.svelte-1dg3wqp{padding:1px 5px;border-radius:3px;background:rgba(0, 0, 0, 0.3);font-family:var(--font-monospace, ui-monospace, monospace)}");
  }
  function create_default_slot26(ctx) {
    let div0;
    let t1;
    let div1;
    let t2;
    let code0;
    let t4;
    let code1;
    let t6;
    let code2;
    return {
      c() {
        div0 = element("div");
        div0.textContent = "This page is served over plain HTTP, so the browser disables several APIs\r\n    (crypto, clipboard, etc) that Obsidian relies on. Several features will not\r\n    work, including graph view, outlines, certain clipboard operations, and\r\n    more.";
        t1 = space();
        div1 = element("div");
        t2 = text("Fix it by serving Ignis over HTTPS (a TLS reverse proxy or\r\n    ");
        code0 = element("code");
        code0.textContent = "tailscale serve";
        t4 = text("). As a local workaround, add this origin to\r\n    ");
        code1 = element("code");
        code1.textContent = "chrome://flags/#unsafely-treat-insecure-origin-as-secure";
        t6 = text(" and\r\n    relaunch the browser: ");
        code2 = element("code");
        code2.textContent = `${/*origin*/
        ctx[0]}`;
        attr(div0, "class", "detail svelte-1dg3wqp");
        attr(code0, "class", "svelte-1dg3wqp");
        attr(code1, "class", "svelte-1dg3wqp");
        attr(code2, "class", "origin svelte-1dg3wqp");
        attr(div1, "class", "fix svelte-1dg3wqp");
      },
      m(target, anchor) {
        insert(target, div0, anchor);
        insert(target, t1, anchor);
        insert(target, div1, anchor);
        append(div1, t2);
        append(div1, code0);
        append(div1, t4);
        append(div1, code1);
        append(div1, t6);
        append(div1, code2);
      },
      p: noop,
      d(detaching) {
        if (detaching) {
          detach(div0);
          detach(t1);
          detach(div1);
        }
      }
    };
  }
  function create_fragment28(ctx) {
    let banner;
    let current;
    banner = new Banner_default({
      props: {
        id: "ignis-insecure-banner",
        severity: "error",
        title: "Insecure connection: some features are broken.",
        $$slots: { default: [create_default_slot26] },
        $$scope: { ctx }
      }
    });
    banner.$on(
      "dismiss",
      /*onDismiss*/
      ctx[1]
    );
    return {
      c() {
        create_component(banner.$$.fragment);
      },
      m(target, anchor) {
        mount_component(banner, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const banner_changes = {};
        if (dirty & /*$$scope*/
        8) {
          banner_changes.$$scope = { dirty, ctx: ctx2 };
        }
        banner.$set(banner_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(banner.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(banner.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(banner, detaching);
      }
    };
  }
  function instance28($$self) {
    const dispatch2 = createEventDispatcher();
    const origin = window.location.origin;
    function onDismiss() {
      dispatch2("dismiss");
    }
    return [origin, onDismiss];
  }
  var InsecureContextNotice = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance28, create_fragment28, safe_not_equal, {}, add_css2);
    }
  };
  var InsecureContextNotice_default = InsecureContextNotice;

  // packages/ui/src/bootstrap.js
  var currentUser = null;
  async function fetchCurrentUser() {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        currentUser = await res.json();
      }
    } catch {
    }
  }
  function showVaultManager() {
    if (document.querySelector(".vault-manager-overlay"))
      return;
    new window.IgnisUI.VaultManager({
      target: document.body,
      props: { vaultService, currentUser }
    });
  }
  function showAdminDashboard() {
    if (document.querySelector(".modal-overlay"))
      return;
    new window.IgnisUI.AdminDashboard({
      target: document.body
    });
  }
  function showMessageDialog(title, message) {
    return new Promise((resolve) => {
      const dialog = new window.IgnisUI.MessageDialog({
        target: document.body,
        props: { title, message }
      });
      dialog.$on("confirm", () => {
        dialog.$destroy();
        resolve();
      });
    });
  }
  function showConfirmDialog(title, message, description, confirmText = "OK") {
    return new Promise((resolve) => {
      const dialog = new window.IgnisUI.ConfirmDialog({
        target: document.body,
        props: { title, message, description, confirmText }
      });
      dialog.$on("confirm", () => {
        dialog.$destroy();
        resolve(true);
      });
      dialog.$on("cancel", () => {
        dialog.$destroy();
        resolve(false);
      });
    });
  }
  function showPromptDialog(title, label, placeholder = "", value = "", confirmText = "OK") {
    return new Promise((resolve) => {
      const dialog = new window.IgnisUI.PromptDialog({
        target: document.body,
        props: { title, label, placeholder, value, confirmText }
      });
      dialog.$on("confirm", (event) => {
        dialog.$destroy();
        resolve(event.detail);
      });
      dialog.$on("cancel", () => {
        dialog.$destroy();
        resolve(null);
      });
    });
  }
  if (typeof window !== "undefined" && window.__ignis_registerUI) {
    window.__ignis_registerUI({
      showVaultManager,
      showAdminDashboard,
      showMessageDialog,
      showConfirmDialog,
      showPromptDialog
    });
  } else if (typeof window !== "undefined") {
    console.warn(
      "[ignis] __ignis_registerUI not available; UI handlers not registered"
    );
  }
  fetchCurrentUser();
  function showInsecureContextNotice() {
    if (window.isSecureContext) {
      return;
    }
    if (document.getElementById("ignis-insecure-banner")) {
      return;
    }
    const notice = new InsecureContextNotice_default({ target: document.body });
    notice.$on("dismiss", () => notice.$destroy());
  }
  if (typeof window !== "undefined") {
    if (document.body) {
      showInsecureContextNotice();
    } else {
      window.addEventListener("DOMContentLoaded", showInsecureContextNotice, {
        once: true
      });
    }
  }

  // packages/ui/src/components/layout/Modal.svelte
  function add_css3(target) {
    append_styles(target, "svelte-1t3ht5j", ".modal-overlay.svelte-1t3ht5j{position:fixed;inset:0;z-index:99999;background:rgba(0, 0, 0, 0.4);display:flex;align-items:center;justify-content:center;font-family:var(--font-interface)}.modal-shell.svelte-1t3ht5j{background:var(--background-secondary);color:var(--text-normal);border-radius:0.75rem;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 1rem 3rem rgba(0, 0, 0, 0.5);overflow:hidden}.modal-header.svelte-1t3ht5j{display:flex;align-items:center;justify-content:space-between;padding:0.5rem 1rem 0.5rem 1.5rem;background:var(--background-primary);flex-shrink:0}.header-left.svelte-1t3ht5j{display:flex;align-items:center;gap:0.625rem;color:var(--text-muted)}.header-title.svelte-1t3ht5j{font-size:1rem;font-weight:600;color:var(--text-normal)}.close-btn.svelte-1t3ht5j{background:none;border:none;box-shadow:none;color:var(--text-muted);cursor:pointer;padding:0.25rem;border-radius:0.25rem;display:flex;align-items:center}.close-btn.svelte-1t3ht5j:hover{color:var(--text-normal)}.modal-footer.svelte-1t3ht5j{padding:0.8rem 1.5rem 0.8rem;flex-shrink:0}");
  }
  var get_footer_slot_changes = (dirty) => ({});
  var get_footer_slot_context = (ctx) => ({});
  var get_icon_slot_changes = (dirty) => ({});
  var get_icon_slot_context = (ctx) => ({});
  function create_if_block2(ctx) {
    let div;
    let current;
    const footer_slot_template = (
      /*#slots*/
      ctx[10].footer
    );
    const footer_slot = create_slot(
      footer_slot_template,
      ctx,
      /*$$scope*/
      ctx[9],
      get_footer_slot_context
    );
    return {
      c() {
        div = element("div");
        if (footer_slot)
          footer_slot.c();
        attr(div, "class", "modal-footer svelte-1t3ht5j");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        if (footer_slot) {
          footer_slot.m(div, null);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (footer_slot) {
          if (footer_slot.p && (!current || dirty & /*$$scope*/
          512)) {
            update_slot_base(
              footer_slot,
              footer_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[9],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[9]
              ) : get_slot_changes(
                footer_slot_template,
                /*$$scope*/
                ctx2[9],
                dirty,
                get_footer_slot_changes
              ),
              get_footer_slot_context
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(footer_slot, local);
        current = true;
      },
      o(local) {
        transition_out(footer_slot, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        if (footer_slot)
          footer_slot.d(detaching);
      }
    };
  }
  function create_fragment29(ctx) {
    let div3;
    let div2;
    let div1;
    let div0;
    let t0;
    let span;
    let t1;
    let t2;
    let button;
    let x3;
    let t3;
    let t4;
    let current;
    let mounted;
    let dispose;
    const icon_slot_template = (
      /*#slots*/
      ctx[10].icon
    );
    const icon_slot = create_slot(
      icon_slot_template,
      ctx,
      /*$$scope*/
      ctx[9],
      get_icon_slot_context
    );
    x3 = new x_default({ props: { size: "1.125rem" } });
    const default_slot_template = (
      /*#slots*/
      ctx[10].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[9],
      null
    );
    let if_block = (
      /*$$slots*/
      ctx[6].footer && create_if_block2(ctx)
    );
    return {
      c() {
        div3 = element("div");
        div2 = element("div");
        div1 = element("div");
        div0 = element("div");
        if (icon_slot)
          icon_slot.c();
        t0 = space();
        span = element("span");
        t1 = text(
          /*title*/
          ctx[0]
        );
        t2 = space();
        button = element("button");
        create_component(x3.$$.fragment);
        t3 = space();
        if (default_slot)
          default_slot.c();
        t4 = space();
        if (if_block)
          if_block.c();
        attr(span, "class", "header-title svelte-1t3ht5j");
        attr(div0, "class", "header-left svelte-1t3ht5j");
        attr(button, "class", "close-btn svelte-1t3ht5j");
        attr(button, "title", "Close");
        attr(div1, "class", "modal-header svelte-1t3ht5j");
        attr(div2, "class", "modal-shell svelte-1t3ht5j");
        set_style(div2, "width", "min(" + /*width*/
        ctx[1] + ", 90vw)");
        attr(div3, "class", "modal-overlay svelte-1t3ht5j");
      },
      m(target, anchor) {
        insert(target, div3, anchor);
        append(div3, div2);
        append(div2, div1);
        append(div1, div0);
        if (icon_slot) {
          icon_slot.m(div0, null);
        }
        append(div0, t0);
        append(div0, span);
        append(span, t1);
        append(div1, t2);
        append(div1, button);
        mount_component(x3, button, null);
        append(div2, t3);
        if (default_slot) {
          default_slot.m(div2, null);
        }
        append(div2, t4);
        if (if_block)
          if_block.m(div2, null);
        ctx[11](div3);
        current = true;
        if (!mounted) {
          dispose = [
            listen(
              button,
              "click",
              /*close*/
              ctx[3]
            ),
            listen(
              div3,
              "click",
              /*onOverlayClick*/
              ctx[4]
            ),
            listen(
              div3,
              "keydown",
              /*onKeydown*/
              ctx[5]
            )
          ];
          mounted = true;
        }
      },
      p(ctx2, [dirty]) {
        if (icon_slot) {
          if (icon_slot.p && (!current || dirty & /*$$scope*/
          512)) {
            update_slot_base(
              icon_slot,
              icon_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[9],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[9]
              ) : get_slot_changes(
                icon_slot_template,
                /*$$scope*/
                ctx2[9],
                dirty,
                get_icon_slot_changes
              ),
              get_icon_slot_context
            );
          }
        }
        if (!current || dirty & /*title*/
        1)
          set_data(
            t1,
            /*title*/
            ctx2[0]
          );
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          512)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[9],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[9]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[9],
                dirty,
                null
              ),
              null
            );
          }
        }
        if (
          /*$$slots*/
          ctx2[6].footer
        ) {
          if (if_block) {
            if_block.p(ctx2, dirty);
            if (dirty & /*$$slots*/
            64) {
              transition_in(if_block, 1);
            }
          } else {
            if_block = create_if_block2(ctx2);
            if_block.c();
            transition_in(if_block, 1);
            if_block.m(div2, null);
          }
        } else if (if_block) {
          group_outros();
          transition_out(if_block, 1, 1, () => {
            if_block = null;
          });
          check_outros();
        }
        if (!current || dirty & /*width*/
        2) {
          set_style(div2, "width", "min(" + /*width*/
          ctx2[1] + ", 90vw)");
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(icon_slot, local);
        transition_in(x3.$$.fragment, local);
        transition_in(default_slot, local);
        transition_in(if_block);
        current = true;
      },
      o(local) {
        transition_out(icon_slot, local);
        transition_out(x3.$$.fragment, local);
        transition_out(default_slot, local);
        transition_out(if_block);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div3);
        }
        if (icon_slot)
          icon_slot.d(detaching);
        destroy_component(x3);
        if (default_slot)
          default_slot.d(detaching);
        if (if_block)
          if_block.d();
        ctx[11](null);
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function instance29($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const $$slots = compute_slots(slots);
    let { title = "" } = $$props;
    let { width = "600px" } = $$props;
    let { closeOnOverlayClick = true } = $$props;
    const dispatch2 = createEventDispatcher();
    let overlayEl;
    function close() {
      if (overlayEl) {
        overlayEl.remove();
      }
      dispatch2("close");
    }
    function onOverlayClick(e) {
      if (e.target === overlayEl && closeOnOverlayClick) {
        close();
      }
    }
    function onKeydown(e) {
      if (e.key === "Escape") {
        dispatch2("escape");
      }
    }
    function dismiss() {
      close();
    }
    function div3_binding($$value) {
      binding_callbacks[$$value ? "unshift" : "push"](() => {
        overlayEl = $$value;
        $$invalidate(2, overlayEl);
      });
    }
    $$self.$$set = ($$props2) => {
      if ("title" in $$props2)
        $$invalidate(0, title = $$props2.title);
      if ("width" in $$props2)
        $$invalidate(1, width = $$props2.width);
      if ("closeOnOverlayClick" in $$props2)
        $$invalidate(7, closeOnOverlayClick = $$props2.closeOnOverlayClick);
      if ("$$scope" in $$props2)
        $$invalidate(9, $$scope = $$props2.$$scope);
    };
    return [
      title,
      width,
      overlayEl,
      close,
      onOverlayClick,
      onKeydown,
      $$slots,
      closeOnOverlayClick,
      dismiss,
      $$scope,
      slots,
      div3_binding
    ];
  }
  var Modal = class extends SvelteComponent {
    constructor(options) {
      super();
      init(
        this,
        options,
        instance29,
        create_fragment29,
        safe_not_equal,
        {
          title: 0,
          width: 1,
          closeOnOverlayClick: 7,
          dismiss: 8
        },
        add_css3
      );
    }
    get dismiss() {
      return this.$$.ctx[8];
    }
  };
  var Modal_default = Modal;

  // packages/ui/src/components/input/Button.svelte
  function add_css4(target) {
    append_styles(target, "svelte-2kjcwi", ".btn.svelte-2kjcwi{display:inline-flex;align-items:center;gap:0.375rem;font-size:0.875rem;font-weight:500;cursor:pointer;border-radius:0.375rem;box-shadow:none;transition:background 0.1s}.btn.svelte-2kjcwi:disabled{opacity:0.5;cursor:not-allowed}.btn-icon.svelte-2kjcwi{display:flex;align-items:center}.primary.svelte-2kjcwi{padding:0.375rem 1rem;border:none;background:var(--interactive-accent);color:var(--text-on-accent)}.primary.svelte-2kjcwi:hover:not(:disabled){filter:brightness(1.1)}.secondary.svelte-2kjcwi{padding:0.375rem 0.75rem;border:1px solid var(--background-modifier-border);background:none;color:var(--text-muted)}.secondary.svelte-2kjcwi:hover:not(:disabled){color:var(--text-normal);background:var(--background-modifier-hover)}.ghost.svelte-2kjcwi{padding:0.375rem 0.5rem;border:none;background:none;color:var(--interactive-accent)}.ghost.svelte-2kjcwi:hover:not(:disabled){background:var(--background-modifier-hover)}.danger.svelte-2kjcwi{padding:0.375rem 1rem;border:none;background:var(--text-error, #e93147);color:#fff}.danger.svelte-2kjcwi:hover:not(:disabled){filter:brightness(1.1)}");
  }
  var get_icon_slot_changes2 = (dirty) => ({});
  var get_icon_slot_context2 = (ctx) => ({});
  function create_if_block3(ctx) {
    let span;
    let current;
    const icon_slot_template = (
      /*#slots*/
      ctx[7].icon
    );
    const icon_slot = create_slot(
      icon_slot_template,
      ctx,
      /*$$scope*/
      ctx[6],
      get_icon_slot_context2
    );
    return {
      c() {
        span = element("span");
        if (icon_slot)
          icon_slot.c();
        attr(span, "class", "btn-icon svelte-2kjcwi");
      },
      m(target, anchor) {
        insert(target, span, anchor);
        if (icon_slot) {
          icon_slot.m(span, null);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (icon_slot) {
          if (icon_slot.p && (!current || dirty & /*$$scope*/
          64)) {
            update_slot_base(
              icon_slot,
              icon_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[6],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[6]
              ) : get_slot_changes(
                icon_slot_template,
                /*$$scope*/
                ctx2[6],
                dirty,
                get_icon_slot_changes2
              ),
              get_icon_slot_context2
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(icon_slot, local);
        current = true;
      },
      o(local) {
        transition_out(icon_slot, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(span);
        }
        if (icon_slot)
          icon_slot.d(detaching);
      }
    };
  }
  function create_fragment30(ctx) {
    let button;
    let t;
    let button_class_value;
    let current;
    let mounted;
    let dispose;
    let if_block = (
      /*$$slots*/
      ctx[5].icon && create_if_block3(ctx)
    );
    const default_slot_template = (
      /*#slots*/
      ctx[7].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[6],
      null
    );
    return {
      c() {
        button = element("button");
        if (if_block)
          if_block.c();
        t = space();
        if (default_slot)
          default_slot.c();
        attr(button, "class", button_class_value = "btn " + /*variant*/
        ctx[0] + " svelte-2kjcwi");
        attr(
          button,
          "type",
          /*type*/
          ctx[3]
        );
        button.disabled = /*disabled*/
        ctx[1];
        attr(
          button,
          "title",
          /*title*/
          ctx[2]
        );
      },
      m(target, anchor) {
        insert(target, button, anchor);
        if (if_block)
          if_block.m(button, null);
        append(button, t);
        if (default_slot) {
          default_slot.m(button, null);
        }
        current = true;
        if (!mounted) {
          dispose = listen(
            button,
            "click",
            /*onClick*/
            ctx[4]
          );
          mounted = true;
        }
      },
      p(ctx2, [dirty]) {
        if (
          /*$$slots*/
          ctx2[5].icon
        ) {
          if (if_block) {
            if_block.p(ctx2, dirty);
            if (dirty & /*$$slots*/
            32) {
              transition_in(if_block, 1);
            }
          } else {
            if_block = create_if_block3(ctx2);
            if_block.c();
            transition_in(if_block, 1);
            if_block.m(button, t);
          }
        } else if (if_block) {
          group_outros();
          transition_out(if_block, 1, 1, () => {
            if_block = null;
          });
          check_outros();
        }
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          64)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[6],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[6]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[6],
                dirty,
                null
              ),
              null
            );
          }
        }
        if (!current || dirty & /*variant*/
        1 && button_class_value !== (button_class_value = "btn " + /*variant*/
        ctx2[0] + " svelte-2kjcwi")) {
          attr(button, "class", button_class_value);
        }
        if (!current || dirty & /*type*/
        8) {
          attr(
            button,
            "type",
            /*type*/
            ctx2[3]
          );
        }
        if (!current || dirty & /*disabled*/
        2) {
          button.disabled = /*disabled*/
          ctx2[1];
        }
        if (!current || dirty & /*title*/
        4) {
          attr(
            button,
            "title",
            /*title*/
            ctx2[2]
          );
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(if_block);
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(if_block);
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(button);
        }
        if (if_block)
          if_block.d();
        if (default_slot)
          default_slot.d(detaching);
        mounted = false;
        dispose();
      }
    };
  }
  function instance30($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const $$slots = compute_slots(slots);
    let { variant = "primary" } = $$props;
    let { disabled = false } = $$props;
    let { title = "" } = $$props;
    let { type: type2 = "button" } = $$props;
    const dispatch2 = createEventDispatcher();
    function onClick(e) {
      if (!disabled) {
        dispatch2("click", e);
      }
    }
    $$self.$$set = ($$props2) => {
      if ("variant" in $$props2)
        $$invalidate(0, variant = $$props2.variant);
      if ("disabled" in $$props2)
        $$invalidate(1, disabled = $$props2.disabled);
      if ("title" in $$props2)
        $$invalidate(2, title = $$props2.title);
      if ("type" in $$props2)
        $$invalidate(3, type2 = $$props2.type);
      if ("$$scope" in $$props2)
        $$invalidate(6, $$scope = $$props2.$$scope);
    };
    return [variant, disabled, title, type2, onClick, $$slots, $$scope, slots];
  }
  var Button = class extends SvelteComponent {
    constructor(options) {
      super();
      init(
        this,
        options,
        instance30,
        create_fragment30,
        safe_not_equal,
        {
          variant: 0,
          disabled: 1,
          title: 2,
          type: 3
        },
        add_css4
      );
    }
  };
  var Button_default = Button;

  // packages/ui/src/components/layout/PromptDialog.svelte
  function add_css5(target) {
    append_styles(target, "svelte-1ri9t3", ".prompt-body.svelte-1ri9t3{padding:1.25rem 1.5rem;border-bottom:1px solid var(--background-modifier-border)}.prompt-label.svelte-1ri9t3{display:block;font-size:1.125rem;font-weight:600;color:var(--text-normal);margin-bottom:0.75rem}.prompt-input.svelte-1ri9t3{width:100%;padding:0.625rem 0.75rem;border-radius:0.375rem;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);font-size:1rem;outline:none;box-shadow:none;box-sizing:border-box}.prompt-input.svelte-1ri9t3:focus{border-color:var(--interactive-accent)}.prompt-footer.svelte-1ri9t3{display:flex;justify-content:flex-end;gap:0.5rem}");
  }
  var get_icon_slot_changes3 = (dirty) => ({});
  var get_icon_slot_context3 = (ctx) => ({});
  var get_confirmIcon_slot_changes = (dirty) => ({});
  var get_confirmIcon_slot_context = (ctx) => ({});
  function create_default_slot_2(ctx) {
    let div;
    let label_1;
    let t0;
    let t1;
    let input;
    let mounted;
    let dispose;
    return {
      c() {
        div = element("div");
        label_1 = element("label");
        t0 = text(
          /*label*/
          ctx[2]
        );
        t1 = space();
        input = element("input");
        attr(label_1, "class", "prompt-label svelte-1ri9t3");
        attr(label_1, "for", "prompt-input");
        attr(input, "id", "prompt-input");
        attr(input, "class", "prompt-input svelte-1ri9t3");
        attr(input, "type", "text");
        attr(
          input,
          "placeholder",
          /*placeholder*/
          ctx[3]
        );
        input.autofocus = true;
        attr(div, "class", "prompt-body svelte-1ri9t3");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, label_1);
        append(label_1, t0);
        append(div, t1);
        append(div, input);
        set_input_value(
          input,
          /*value*/
          ctx[0]
        );
        input.focus();
        if (!mounted) {
          dispose = [
            listen(
              input,
              "input",
              /*input_input_handler*/
              ctx[13]
            ),
            listen(
              input,
              "keydown",
              /*onKeydown*/
              ctx[10]
            )
          ];
          mounted = true;
        }
      },
      p(ctx2, dirty) {
        if (dirty & /*label*/
        4)
          set_data(
            t0,
            /*label*/
            ctx2[2]
          );
        if (dirty & /*placeholder*/
        8) {
          attr(
            input,
            "placeholder",
            /*placeholder*/
            ctx2[3]
          );
        }
        if (dirty & /*value*/
        1 && input.value !== /*value*/
        ctx2[0]) {
          set_input_value(
            input,
            /*value*/
            ctx2[0]
          );
        }
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function create_icon_slot_1(ctx) {
    let current;
    const icon_slot_template = (
      /*#slots*/
      ctx[12].icon
    );
    const icon_slot = create_slot(
      icon_slot_template,
      ctx,
      /*$$scope*/
      ctx[15],
      get_icon_slot_context3
    );
    return {
      c() {
        if (icon_slot)
          icon_slot.c();
      },
      m(target, anchor) {
        if (icon_slot) {
          icon_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (icon_slot) {
          if (icon_slot.p && (!current || dirty & /*$$scope*/
          32768)) {
            update_slot_base(
              icon_slot,
              icon_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[15],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[15]
              ) : get_slot_changes(
                icon_slot_template,
                /*$$scope*/
                ctx2[15],
                dirty,
                get_icon_slot_changes3
              ),
              get_icon_slot_context3
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(icon_slot, local);
        current = true;
      },
      o(local) {
        transition_out(icon_slot, local);
        current = false;
      },
      d(detaching) {
        if (icon_slot)
          icon_slot.d(detaching);
      }
    };
  }
  function create_default_slot_1(ctx) {
    let t;
    return {
      c() {
        t = text("Cancel");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_default_slot27(ctx) {
    let t;
    return {
      c() {
        t = text(
          /*confirmText*/
          ctx[4]
        );
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      p(ctx2, dirty) {
        if (dirty & /*confirmText*/
        16)
          set_data(
            t,
            /*confirmText*/
            ctx2[4]
          );
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_icon_slot(ctx) {
    let current;
    const confirmIcon_slot_template = (
      /*#slots*/
      ctx[12].confirmIcon
    );
    const confirmIcon_slot = create_slot(
      confirmIcon_slot_template,
      ctx,
      /*$$scope*/
      ctx[15],
      get_confirmIcon_slot_context
    );
    return {
      c() {
        if (confirmIcon_slot)
          confirmIcon_slot.c();
      },
      m(target, anchor) {
        if (confirmIcon_slot) {
          confirmIcon_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (confirmIcon_slot) {
          if (confirmIcon_slot.p && (!current || dirty & /*$$scope*/
          32768)) {
            update_slot_base(
              confirmIcon_slot,
              confirmIcon_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[15],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[15]
              ) : get_slot_changes(
                confirmIcon_slot_template,
                /*$$scope*/
                ctx2[15],
                dirty,
                get_confirmIcon_slot_changes
              ),
              get_confirmIcon_slot_context
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(confirmIcon_slot, local);
        current = true;
      },
      o(local) {
        transition_out(confirmIcon_slot, local);
        current = false;
      },
      d(detaching) {
        if (confirmIcon_slot)
          confirmIcon_slot.d(detaching);
      }
    };
  }
  function create_footer_slot(ctx) {
    let div;
    let button0;
    let t;
    let button1;
    let current;
    button0 = new Button_default({
      props: {
        variant: "secondary",
        $$slots: { default: [create_default_slot_1] },
        $$scope: { ctx }
      }
    });
    button0.$on(
      "click",
      /*onCancel*/
      ctx[8]
    );
    button1 = new Button_default({
      props: {
        variant: "primary",
        $$slots: {
          icon: [create_icon_slot],
          default: [create_default_slot27]
        },
        $$scope: { ctx }
      }
    });
    button1.$on(
      "click",
      /*onConfirm*/
      ctx[7]
    );
    return {
      c() {
        div = element("div");
        create_component(button0.$$.fragment);
        t = space();
        create_component(button1.$$.fragment);
        attr(div, "class", "prompt-footer svelte-1ri9t3");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        mount_component(button0, div, null);
        append(div, t);
        mount_component(button1, div, null);
        current = true;
      },
      p(ctx2, dirty) {
        const button0_changes = {};
        if (dirty & /*$$scope*/
        32768) {
          button0_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button0.$set(button0_changes);
        const button1_changes = {};
        if (dirty & /*$$scope, confirmText*/
        32784) {
          button1_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button1.$set(button1_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(button0.$$.fragment, local);
        transition_in(button1.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(button0.$$.fragment, local);
        transition_out(button1.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        destroy_component(button0);
        destroy_component(button1);
      }
    };
  }
  function create_fragment31(ctx) {
    let modal;
    let current;
    let modal_props = {
      title: (
        /*title*/
        ctx[1]
      ),
      width: (
        /*width*/
        ctx[5]
      ),
      closeOnOverlayClick: false,
      $$slots: {
        footer: [create_footer_slot],
        icon: [create_icon_slot_1],
        default: [create_default_slot_2]
      },
      $$scope: { ctx }
    };
    modal = new Modal_default({ props: modal_props });
    ctx[14](modal);
    modal.$on(
      "escape",
      /*onEscape*/
      ctx[9]
    );
    return {
      c() {
        create_component(modal.$$.fragment);
      },
      m(target, anchor) {
        mount_component(modal, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const modal_changes = {};
        if (dirty & /*title*/
        2)
          modal_changes.title = /*title*/
          ctx2[1];
        if (dirty & /*width*/
        32)
          modal_changes.width = /*width*/
          ctx2[5];
        if (dirty & /*$$scope, confirmText, placeholder, value, label*/
        32797) {
          modal_changes.$$scope = { dirty, ctx: ctx2 };
        }
        modal.$set(modal_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(modal.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(modal.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        ctx[14](null);
        destroy_component(modal, detaching);
      }
    };
  }
  function instance31($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    let { title = "" } = $$props;
    let { label = "" } = $$props;
    let { value = "" } = $$props;
    let { placeholder = "" } = $$props;
    let { confirmText = "Confirm" } = $$props;
    let { width = "500px" } = $$props;
    const dispatch2 = createEventDispatcher();
    let modalRef;
    function onConfirm() {
      dispatch2("confirm", value);
    }
    function onCancel() {
      modalRef.dismiss();
      dispatch2("cancel");
    }
    function onEscape() {
      onCancel();
    }
    function onKeydown(e) {
      if (e.key === "Enter") {
        onConfirm();
      }
    }
    function dismiss() {
      modalRef.dismiss();
    }
    function input_input_handler() {
      value = this.value;
      $$invalidate(0, value);
    }
    function modal_binding($$value) {
      binding_callbacks[$$value ? "unshift" : "push"](() => {
        modalRef = $$value;
        $$invalidate(6, modalRef);
      });
    }
    $$self.$$set = ($$props2) => {
      if ("title" in $$props2)
        $$invalidate(1, title = $$props2.title);
      if ("label" in $$props2)
        $$invalidate(2, label = $$props2.label);
      if ("value" in $$props2)
        $$invalidate(0, value = $$props2.value);
      if ("placeholder" in $$props2)
        $$invalidate(3, placeholder = $$props2.placeholder);
      if ("confirmText" in $$props2)
        $$invalidate(4, confirmText = $$props2.confirmText);
      if ("width" in $$props2)
        $$invalidate(5, width = $$props2.width);
      if ("$$scope" in $$props2)
        $$invalidate(15, $$scope = $$props2.$$scope);
    };
    return [
      value,
      title,
      label,
      placeholder,
      confirmText,
      width,
      modalRef,
      onConfirm,
      onCancel,
      onEscape,
      onKeydown,
      dismiss,
      slots,
      input_input_handler,
      modal_binding,
      $$scope
    ];
  }
  var PromptDialog = class extends SvelteComponent {
    constructor(options) {
      super();
      init(
        this,
        options,
        instance31,
        create_fragment31,
        safe_not_equal,
        {
          title: 1,
          label: 2,
          value: 0,
          placeholder: 3,
          confirmText: 4,
          width: 5,
          dismiss: 11
        },
        add_css5
      );
    }
    get dismiss() {
      return this.$$.ctx[11];
    }
  };
  var PromptDialog_default = PromptDialog;

  // packages/ui/src/components/layout/ConfirmDialog.svelte
  function add_css6(target) {
    append_styles(target, "svelte-89hn9h", ".confirm-body.svelte-89hn9h{padding:1.25rem 1.5rem;border-bottom:1px solid var(--background-modifier-border)}.confirm-message.svelte-89hn9h{margin:0 0 0.5rem;font-size:1.125rem;font-weight:600;color:var(--text-normal)}.confirm-description.svelte-89hn9h{margin:0;font-size:0.875rem;color:var(--text-muted);line-height:1.5}.confirm-footer.svelte-89hn9h{display:flex;justify-content:flex-end;gap:0.5rem}");
  }
  var get_icon_slot_changes4 = (dirty) => ({});
  var get_icon_slot_context4 = (ctx) => ({});
  var get_confirmIcon_slot_changes2 = (dirty) => ({});
  var get_confirmIcon_slot_context2 = (ctx) => ({});
  function create_if_block4(ctx) {
    let p;
    let t;
    return {
      c() {
        p = element("p");
        t = text(
          /*description*/
          ctx[2]
        );
        attr(p, "class", "confirm-description svelte-89hn9h");
      },
      m(target, anchor) {
        insert(target, p, anchor);
        append(p, t);
      },
      p(ctx2, dirty) {
        if (dirty & /*description*/
        4)
          set_data(
            t,
            /*description*/
            ctx2[2]
          );
      },
      d(detaching) {
        if (detaching) {
          detach(p);
        }
      }
    };
  }
  function create_default_slot_22(ctx) {
    let div;
    let p;
    let t0;
    let t1;
    let if_block = (
      /*description*/
      ctx[2] && create_if_block4(ctx)
    );
    return {
      c() {
        div = element("div");
        p = element("p");
        t0 = text(
          /*message*/
          ctx[1]
        );
        t1 = space();
        if (if_block)
          if_block.c();
        attr(p, "class", "confirm-message svelte-89hn9h");
        attr(div, "class", "confirm-body svelte-89hn9h");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, p);
        append(p, t0);
        append(div, t1);
        if (if_block)
          if_block.m(div, null);
      },
      p(ctx2, dirty) {
        if (dirty & /*message*/
        2)
          set_data(
            t0,
            /*message*/
            ctx2[1]
          );
        if (
          /*description*/
          ctx2[2]
        ) {
          if (if_block) {
            if_block.p(ctx2, dirty);
          } else {
            if_block = create_if_block4(ctx2);
            if_block.c();
            if_block.m(div, null);
          }
        } else if (if_block) {
          if_block.d(1);
          if_block = null;
        }
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        if (if_block)
          if_block.d();
      }
    };
  }
  function create_icon_slot_12(ctx) {
    let current;
    const icon_slot_template = (
      /*#slots*/
      ctx[11].icon
    );
    const icon_slot = create_slot(
      icon_slot_template,
      ctx,
      /*$$scope*/
      ctx[13],
      get_icon_slot_context4
    );
    return {
      c() {
        if (icon_slot)
          icon_slot.c();
      },
      m(target, anchor) {
        if (icon_slot) {
          icon_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (icon_slot) {
          if (icon_slot.p && (!current || dirty & /*$$scope*/
          8192)) {
            update_slot_base(
              icon_slot,
              icon_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[13],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[13]
              ) : get_slot_changes(
                icon_slot_template,
                /*$$scope*/
                ctx2[13],
                dirty,
                get_icon_slot_changes4
              ),
              get_icon_slot_context4
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(icon_slot, local);
        current = true;
      },
      o(local) {
        transition_out(icon_slot, local);
        current = false;
      },
      d(detaching) {
        if (icon_slot)
          icon_slot.d(detaching);
      }
    };
  }
  function create_default_slot_12(ctx) {
    let t;
    return {
      c() {
        t = text("Cancel");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_default_slot28(ctx) {
    let t;
    return {
      c() {
        t = text(
          /*confirmText*/
          ctx[3]
        );
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      p(ctx2, dirty) {
        if (dirty & /*confirmText*/
        8)
          set_data(
            t,
            /*confirmText*/
            ctx2[3]
          );
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_icon_slot2(ctx) {
    let current;
    const confirmIcon_slot_template = (
      /*#slots*/
      ctx[11].confirmIcon
    );
    const confirmIcon_slot = create_slot(
      confirmIcon_slot_template,
      ctx,
      /*$$scope*/
      ctx[13],
      get_confirmIcon_slot_context2
    );
    return {
      c() {
        if (confirmIcon_slot)
          confirmIcon_slot.c();
      },
      m(target, anchor) {
        if (confirmIcon_slot) {
          confirmIcon_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (confirmIcon_slot) {
          if (confirmIcon_slot.p && (!current || dirty & /*$$scope*/
          8192)) {
            update_slot_base(
              confirmIcon_slot,
              confirmIcon_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[13],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[13]
              ) : get_slot_changes(
                confirmIcon_slot_template,
                /*$$scope*/
                ctx2[13],
                dirty,
                get_confirmIcon_slot_changes2
              ),
              get_confirmIcon_slot_context2
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(confirmIcon_slot, local);
        current = true;
      },
      o(local) {
        transition_out(confirmIcon_slot, local);
        current = false;
      },
      d(detaching) {
        if (confirmIcon_slot)
          confirmIcon_slot.d(detaching);
      }
    };
  }
  function create_footer_slot2(ctx) {
    let div;
    let button0;
    let t;
    let button1;
    let current;
    button0 = new Button_default({
      props: {
        variant: "secondary",
        $$slots: { default: [create_default_slot_12] },
        $$scope: { ctx }
      }
    });
    button0.$on(
      "click",
      /*onCancel*/
      ctx[8]
    );
    button1 = new Button_default({
      props: {
        variant: (
          /*confirmVariant*/
          ctx[4]
        ),
        $$slots: {
          icon: [create_icon_slot2],
          default: [create_default_slot28]
        },
        $$scope: { ctx }
      }
    });
    button1.$on(
      "click",
      /*onConfirm*/
      ctx[7]
    );
    return {
      c() {
        div = element("div");
        create_component(button0.$$.fragment);
        t = space();
        create_component(button1.$$.fragment);
        attr(div, "class", "confirm-footer svelte-89hn9h");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        mount_component(button0, div, null);
        append(div, t);
        mount_component(button1, div, null);
        current = true;
      },
      p(ctx2, dirty) {
        const button0_changes = {};
        if (dirty & /*$$scope*/
        8192) {
          button0_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button0.$set(button0_changes);
        const button1_changes = {};
        if (dirty & /*confirmVariant*/
        16)
          button1_changes.variant = /*confirmVariant*/
          ctx2[4];
        if (dirty & /*$$scope, confirmText*/
        8200) {
          button1_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button1.$set(button1_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(button0.$$.fragment, local);
        transition_in(button1.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(button0.$$.fragment, local);
        transition_out(button1.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        destroy_component(button0);
        destroy_component(button1);
      }
    };
  }
  function create_fragment32(ctx) {
    let modal;
    let current;
    let modal_props = {
      title: (
        /*title*/
        ctx[0]
      ),
      width: (
        /*width*/
        ctx[5]
      ),
      closeOnOverlayClick: false,
      $$slots: {
        footer: [create_footer_slot2],
        icon: [create_icon_slot_12],
        default: [create_default_slot_22]
      },
      $$scope: { ctx }
    };
    modal = new Modal_default({ props: modal_props });
    ctx[12](modal);
    modal.$on(
      "escape",
      /*onEscape*/
      ctx[9]
    );
    return {
      c() {
        create_component(modal.$$.fragment);
      },
      m(target, anchor) {
        mount_component(modal, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const modal_changes = {};
        if (dirty & /*title*/
        1)
          modal_changes.title = /*title*/
          ctx2[0];
        if (dirty & /*width*/
        32)
          modal_changes.width = /*width*/
          ctx2[5];
        if (dirty & /*$$scope, confirmVariant, confirmText, description, message*/
        8222) {
          modal_changes.$$scope = { dirty, ctx: ctx2 };
        }
        modal.$set(modal_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(modal.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(modal.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        ctx[12](null);
        destroy_component(modal, detaching);
      }
    };
  }
  function instance32($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    let { title = "" } = $$props;
    let { message = "" } = $$props;
    let { description = "" } = $$props;
    let { confirmText = "Confirm" } = $$props;
    let { confirmVariant = "primary" } = $$props;
    let { width = "500px" } = $$props;
    const dispatch2 = createEventDispatcher();
    let modalRef;
    function onConfirm() {
      dispatch2("confirm");
    }
    function onCancel() {
      modalRef.dismiss();
      dispatch2("cancel");
    }
    function onEscape() {
      onCancel();
    }
    function dismiss() {
      modalRef.dismiss();
    }
    function modal_binding($$value) {
      binding_callbacks[$$value ? "unshift" : "push"](() => {
        modalRef = $$value;
        $$invalidate(6, modalRef);
      });
    }
    $$self.$$set = ($$props2) => {
      if ("title" in $$props2)
        $$invalidate(0, title = $$props2.title);
      if ("message" in $$props2)
        $$invalidate(1, message = $$props2.message);
      if ("description" in $$props2)
        $$invalidate(2, description = $$props2.description);
      if ("confirmText" in $$props2)
        $$invalidate(3, confirmText = $$props2.confirmText);
      if ("confirmVariant" in $$props2)
        $$invalidate(4, confirmVariant = $$props2.confirmVariant);
      if ("width" in $$props2)
        $$invalidate(5, width = $$props2.width);
      if ("$$scope" in $$props2)
        $$invalidate(13, $$scope = $$props2.$$scope);
    };
    return [
      title,
      message,
      description,
      confirmText,
      confirmVariant,
      width,
      modalRef,
      onConfirm,
      onCancel,
      onEscape,
      dismiss,
      slots,
      modal_binding,
      $$scope
    ];
  }
  var ConfirmDialog = class extends SvelteComponent {
    constructor(options) {
      super();
      init(
        this,
        options,
        instance32,
        create_fragment32,
        safe_not_equal,
        {
          title: 0,
          message: 1,
          description: 2,
          confirmText: 3,
          confirmVariant: 4,
          width: 5,
          dismiss: 10
        },
        add_css6
      );
    }
    get dismiss() {
      return this.$$.ctx[10];
    }
  };
  var ConfirmDialog_default = ConfirmDialog;

  // packages/ui/src/components/layout/MessageDialog.svelte
  function add_css7(target) {
    append_styles(target, "svelte-o5gz3n", ".message-body.svelte-o5gz3n{padding:1.25rem 1.5rem;border-bottom:1px solid var(--background-modifier-border)}.message-text.svelte-o5gz3n{margin:0;font-size:0.9375rem;color:var(--text-normal);line-height:1.5;white-space:pre-wrap}.message-footer.svelte-o5gz3n{display:flex;justify-content:flex-end}");
  }
  function create_default_slot_13(ctx) {
    let div;
    let p;
    let t;
    return {
      c() {
        div = element("div");
        p = element("p");
        t = text(
          /*message*/
          ctx[1]
        );
        attr(p, "class", "message-text svelte-o5gz3n");
        attr(div, "class", "message-body svelte-o5gz3n");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, p);
        append(p, t);
      },
      p(ctx2, dirty) {
        if (dirty & /*message*/
        2)
          set_data(
            t,
            /*message*/
            ctx2[1]
          );
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_icon_slot3(ctx) {
    let circlealert;
    let current;
    circlealert = new circle_alert_default({ props: { size: "1.25rem" } });
    return {
      c() {
        create_component(circlealert.$$.fragment);
      },
      m(target, anchor) {
        mount_component(circlealert, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(circlealert.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(circlealert.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(circlealert, detaching);
      }
    };
  }
  function create_default_slot29(ctx) {
    let t;
    return {
      c() {
        t = text("OK");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_footer_slot3(ctx) {
    let div;
    let button;
    let current;
    button = new Button_default({
      props: {
        variant: "primary",
        $$slots: { default: [create_default_slot29] },
        $$scope: { ctx }
      }
    });
    button.$on(
      "click",
      /*onConfirm*/
      ctx[4]
    );
    return {
      c() {
        div = element("div");
        create_component(button.$$.fragment);
        attr(div, "class", "message-footer svelte-o5gz3n");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        mount_component(button, div, null);
        current = true;
      },
      p(ctx2, dirty) {
        const button_changes = {};
        if (dirty & /*$$scope*/
        512) {
          button_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button.$set(button_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(button.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(button.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        destroy_component(button);
      }
    };
  }
  function create_fragment33(ctx) {
    let modal;
    let current;
    let modal_props = {
      title: (
        /*title*/
        ctx[0]
      ),
      width: (
        /*width*/
        ctx[2]
      ),
      closeOnOverlayClick: false,
      $$slots: {
        footer: [create_footer_slot3],
        icon: [create_icon_slot3],
        default: [create_default_slot_13]
      },
      $$scope: { ctx }
    };
    modal = new Modal_default({ props: modal_props });
    ctx[7](modal);
    modal.$on(
      "escape",
      /*onEscape*/
      ctx[5]
    );
    return {
      c() {
        create_component(modal.$$.fragment);
      },
      m(target, anchor) {
        mount_component(modal, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const modal_changes = {};
        if (dirty & /*title*/
        1)
          modal_changes.title = /*title*/
          ctx2[0];
        if (dirty & /*width*/
        4)
          modal_changes.width = /*width*/
          ctx2[2];
        if (dirty & /*$$scope, message*/
        514) {
          modal_changes.$$scope = { dirty, ctx: ctx2 };
        }
        modal.$set(modal_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(modal.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(modal.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        ctx[7](null);
        destroy_component(modal, detaching);
      }
    };
  }
  function instance33($$self, $$props, $$invalidate) {
    let { title = "Message" } = $$props;
    let { message = "" } = $$props;
    let { width = "500px" } = $$props;
    const dispatch2 = createEventDispatcher();
    let modalRef;
    function onConfirm() {
      modalRef.dismiss();
      dispatch2("confirm");
    }
    function onEscape() {
      onConfirm();
    }
    function dismiss() {
      modalRef.dismiss();
    }
    function modal_binding($$value) {
      binding_callbacks[$$value ? "unshift" : "push"](() => {
        modalRef = $$value;
        $$invalidate(3, modalRef);
      });
    }
    $$self.$$set = ($$props2) => {
      if ("title" in $$props2)
        $$invalidate(0, title = $$props2.title);
      if ("message" in $$props2)
        $$invalidate(1, message = $$props2.message);
      if ("width" in $$props2)
        $$invalidate(2, width = $$props2.width);
    };
    return [title, message, width, modalRef, onConfirm, onEscape, dismiss, modal_binding];
  }
  var MessageDialog = class extends SvelteComponent {
    constructor(options) {
      super();
      init(
        this,
        options,
        instance33,
        create_fragment33,
        safe_not_equal,
        {
          title: 0,
          message: 1,
          width: 2,
          dismiss: 6
        },
        add_css7
      );
    }
    get dismiss() {
      return this.$$.ctx[6];
    }
  };
  var MessageDialog_default = MessageDialog;

  // packages/ui/src/components/input/SearchInput.svelte
  function add_css8(target) {
    append_styles(target, "svelte-3djej6", ".search-input.svelte-3djej6{position:relative;display:flex;align-items:center}.search-icon.svelte-3djej6{position:absolute;left:0.625rem;color:var(--text-muted);pointer-events:none;margin-top:0.2rem}input.svelte-3djej6{width:100%;padding:0.375rem 0.625rem 0.375rem 1.875rem;border-radius:0.375rem;border:1px solid var(--background-primary);background:var(--background-primary);color:var(--text-normal);font-size:0.8125rem;outline:none;box-shadow:none}input.svelte-3djej6:hover{background:var(--background-modifier-form-field)}input.svelte-3djej6::placeholder{color:var(--text-muted)}input.svelte-3djej6:focus{border-color:var(--interactive-accent)}input.svelte-3djej6:focus:hover{background:var(--background-primary)}");
  }
  function create_fragment34(ctx) {
    let div;
    let span;
    let search;
    let t;
    let input;
    let current;
    let mounted;
    let dispose;
    search = new search_default({ props: { size: "0.875rem" } });
    return {
      c() {
        div = element("div");
        span = element("span");
        create_component(search.$$.fragment);
        t = space();
        input = element("input");
        attr(span, "class", "search-icon svelte-3djej6");
        attr(input, "type", "text");
        attr(
          input,
          "placeholder",
          /*placeholder*/
          ctx[1]
        );
        input.value = /*value*/
        ctx[0];
        attr(input, "class", "svelte-3djej6");
        attr(div, "class", "search-input svelte-3djej6");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, span);
        mount_component(search, span, null);
        append(div, t);
        append(div, input);
        current = true;
        if (!mounted) {
          dispose = listen(
            input,
            "input",
            /*onInput*/
            ctx[2]
          );
          mounted = true;
        }
      },
      p(ctx2, [dirty]) {
        if (!current || dirty & /*placeholder*/
        2) {
          attr(
            input,
            "placeholder",
            /*placeholder*/
            ctx2[1]
          );
        }
        if (!current || dirty & /*value*/
        1 && input.value !== /*value*/
        ctx2[0]) {
          input.value = /*value*/
          ctx2[0];
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(search.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(search.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        destroy_component(search);
        mounted = false;
        dispose();
      }
    };
  }
  function instance34($$self, $$props, $$invalidate) {
    let { value = "" } = $$props;
    let { placeholder = "Search" } = $$props;
    const dispatch2 = createEventDispatcher();
    function onInput(e) {
      dispatch2("input", e.target.value);
    }
    $$self.$$set = ($$props2) => {
      if ("value" in $$props2)
        $$invalidate(0, value = $$props2.value);
      if ("placeholder" in $$props2)
        $$invalidate(1, placeholder = $$props2.placeholder);
    };
    return [value, placeholder, onInput];
  }
  var SearchInput = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance34, create_fragment34, safe_not_equal, { value: 0, placeholder: 1 }, add_css8);
    }
  };
  var SearchInput_default = SearchInput;

  // packages/ui/src/components/display/ListItem.svelte
  function add_css9(target) {
    append_styles(target, "svelte-16bpy8f", ".list-item.svelte-16bpy8f{display:flex;align-items:center;gap:1rem;padding:0.5rem 0.4rem 0.5rem 1rem;margin:0 0.2rem;background:var(--background-primary);border-radius:0.5rem;border:1px solid transparent;transition:background 0.1s,\r\n      border-color 0.1s}.list-item.clickable.svelte-16bpy8f{cursor:pointer}.list-item.clickable.svelte-16bpy8f:hover{background:var(--background-modifier-hover);border-color:var(--background-modifier-border)}.item-icon.svelte-16bpy8f{display:flex;align-items:center;flex-shrink:0;color:var(--text-muted);opacity:0.6}.item-content.svelte-16bpy8f{flex:1;min-width:0;display:flex;flex-direction:column;gap:0.125rem}.item-primary.svelte-16bpy8f{font-weight:600;font-size:1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.item-secondary.svelte-16bpy8f{font-size:0.8125rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.item-action.svelte-16bpy8f{flex-shrink:0;margin-left:auto}");
  }
  var get_action_slot_changes = (dirty) => ({});
  var get_action_slot_context = (ctx) => ({});
  var get_icon_slot_changes5 = (dirty) => ({});
  var get_icon_slot_context5 = (ctx) => ({});
  function create_if_block_3(ctx) {
    let div;
    let current;
    const icon_slot_template = (
      /*#slots*/
      ctx[7].icon
    );
    const icon_slot = create_slot(
      icon_slot_template,
      ctx,
      /*$$scope*/
      ctx[6],
      get_icon_slot_context5
    );
    return {
      c() {
        div = element("div");
        if (icon_slot)
          icon_slot.c();
        attr(div, "class", "item-icon svelte-16bpy8f");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        if (icon_slot) {
          icon_slot.m(div, null);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (icon_slot) {
          if (icon_slot.p && (!current || dirty & /*$$scope*/
          64)) {
            update_slot_base(
              icon_slot,
              icon_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[6],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[6]
              ) : get_slot_changes(
                icon_slot_template,
                /*$$scope*/
                ctx2[6],
                dirty,
                get_icon_slot_changes5
              ),
              get_icon_slot_context5
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(icon_slot, local);
        current = true;
      },
      o(local) {
        transition_out(icon_slot, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        if (icon_slot)
          icon_slot.d(detaching);
      }
    };
  }
  function create_else_block(ctx) {
    let span;
    let t0;
    let t1;
    let if_block_anchor;
    let if_block = (
      /*secondary*/
      ctx[1] && create_if_block_2(ctx)
    );
    return {
      c() {
        span = element("span");
        t0 = text(
          /*primary*/
          ctx[0]
        );
        t1 = space();
        if (if_block)
          if_block.c();
        if_block_anchor = empty();
        attr(span, "class", "item-primary svelte-16bpy8f");
      },
      m(target, anchor) {
        insert(target, span, anchor);
        append(span, t0);
        insert(target, t1, anchor);
        if (if_block)
          if_block.m(target, anchor);
        insert(target, if_block_anchor, anchor);
      },
      p(ctx2, dirty) {
        if (dirty & /*primary*/
        1)
          set_data(
            t0,
            /*primary*/
            ctx2[0]
          );
        if (
          /*secondary*/
          ctx2[1]
        ) {
          if (if_block) {
            if_block.p(ctx2, dirty);
          } else {
            if_block = create_if_block_2(ctx2);
            if_block.c();
            if_block.m(if_block_anchor.parentNode, if_block_anchor);
          }
        } else if (if_block) {
          if_block.d(1);
          if_block = null;
        }
      },
      i: noop,
      o: noop,
      d(detaching) {
        if (detaching) {
          detach(span);
          detach(t1);
          detach(if_block_anchor);
        }
        if (if_block)
          if_block.d(detaching);
      }
    };
  }
  function create_if_block_12(ctx) {
    let current;
    const default_slot_template = (
      /*#slots*/
      ctx[7].default
    );
    const default_slot = create_slot(
      default_slot_template,
      ctx,
      /*$$scope*/
      ctx[6],
      null
    );
    return {
      c() {
        if (default_slot)
          default_slot.c();
      },
      m(target, anchor) {
        if (default_slot) {
          default_slot.m(target, anchor);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (default_slot) {
          if (default_slot.p && (!current || dirty & /*$$scope*/
          64)) {
            update_slot_base(
              default_slot,
              default_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[6],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[6]
              ) : get_slot_changes(
                default_slot_template,
                /*$$scope*/
                ctx2[6],
                dirty,
                null
              ),
              null
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(default_slot, local);
        current = true;
      },
      o(local) {
        transition_out(default_slot, local);
        current = false;
      },
      d(detaching) {
        if (default_slot)
          default_slot.d(detaching);
      }
    };
  }
  function create_if_block_2(ctx) {
    let span;
    let t;
    return {
      c() {
        span = element("span");
        t = text(
          /*secondary*/
          ctx[1]
        );
        attr(span, "class", "item-secondary svelte-16bpy8f");
      },
      m(target, anchor) {
        insert(target, span, anchor);
        append(span, t);
      },
      p(ctx2, dirty) {
        if (dirty & /*secondary*/
        2)
          set_data(
            t,
            /*secondary*/
            ctx2[1]
          );
      },
      d(detaching) {
        if (detaching) {
          detach(span);
        }
      }
    };
  }
  function create_if_block5(ctx) {
    let div;
    let current;
    const action_slot_template = (
      /*#slots*/
      ctx[7].action
    );
    const action_slot = create_slot(
      action_slot_template,
      ctx,
      /*$$scope*/
      ctx[6],
      get_action_slot_context
    );
    return {
      c() {
        div = element("div");
        if (action_slot)
          action_slot.c();
        attr(div, "class", "item-action svelte-16bpy8f");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        if (action_slot) {
          action_slot.m(div, null);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (action_slot) {
          if (action_slot.p && (!current || dirty & /*$$scope*/
          64)) {
            update_slot_base(
              action_slot,
              action_slot_template,
              ctx2,
              /*$$scope*/
              ctx2[6],
              !current ? get_all_dirty_from_scope(
                /*$$scope*/
                ctx2[6]
              ) : get_slot_changes(
                action_slot_template,
                /*$$scope*/
                ctx2[6],
                dirty,
                get_action_slot_changes
              ),
              get_action_slot_context
            );
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(action_slot, local);
        current = true;
      },
      o(local) {
        transition_out(action_slot, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        if (action_slot)
          action_slot.d(detaching);
      }
    };
  }
  function create_fragment35(ctx) {
    let div1;
    let t0;
    let div0;
    let current_block_type_index;
    let if_block1;
    let t1;
    let current;
    let mounted;
    let dispose;
    let if_block0 = (
      /*$$slots*/
      ctx[5].icon && create_if_block_3(ctx)
    );
    const if_block_creators = [create_if_block_12, create_else_block];
    const if_blocks = [];
    function select_block_type(ctx2, dirty) {
      if (
        /*$$slots*/
        ctx2[5].default
      )
        return 0;
      return 1;
    }
    current_block_type_index = select_block_type(ctx, -1);
    if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    let if_block2 = (
      /*$$slots*/
      ctx[5].action && create_if_block5(ctx)
    );
    return {
      c() {
        div1 = element("div");
        if (if_block0)
          if_block0.c();
        t0 = space();
        div0 = element("div");
        if_block1.c();
        t1 = space();
        if (if_block2)
          if_block2.c();
        attr(div0, "class", "item-content svelte-16bpy8f");
        attr(div1, "class", "list-item svelte-16bpy8f");
        toggle_class(
          div1,
          "active",
          /*active*/
          ctx[2]
        );
        toggle_class(
          div1,
          "clickable",
          /*clickable*/
          ctx[3]
        );
      },
      m(target, anchor) {
        insert(target, div1, anchor);
        if (if_block0)
          if_block0.m(div1, null);
        append(div1, t0);
        append(div1, div0);
        if_blocks[current_block_type_index].m(div0, null);
        append(div1, t1);
        if (if_block2)
          if_block2.m(div1, null);
        current = true;
        if (!mounted) {
          dispose = listen(
            div1,
            "click",
            /*onClick*/
            ctx[4]
          );
          mounted = true;
        }
      },
      p(ctx2, [dirty]) {
        if (
          /*$$slots*/
          ctx2[5].icon
        ) {
          if (if_block0) {
            if_block0.p(ctx2, dirty);
            if (dirty & /*$$slots*/
            32) {
              transition_in(if_block0, 1);
            }
          } else {
            if_block0 = create_if_block_3(ctx2);
            if_block0.c();
            transition_in(if_block0, 1);
            if_block0.m(div1, t0);
          }
        } else if (if_block0) {
          group_outros();
          transition_out(if_block0, 1, 1, () => {
            if_block0 = null;
          });
          check_outros();
        }
        let previous_block_index = current_block_type_index;
        current_block_type_index = select_block_type(ctx2, dirty);
        if (current_block_type_index === previous_block_index) {
          if_blocks[current_block_type_index].p(ctx2, dirty);
        } else {
          group_outros();
          transition_out(if_blocks[previous_block_index], 1, 1, () => {
            if_blocks[previous_block_index] = null;
          });
          check_outros();
          if_block1 = if_blocks[current_block_type_index];
          if (!if_block1) {
            if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx2);
            if_block1.c();
          } else {
            if_block1.p(ctx2, dirty);
          }
          transition_in(if_block1, 1);
          if_block1.m(div0, null);
        }
        if (
          /*$$slots*/
          ctx2[5].action
        ) {
          if (if_block2) {
            if_block2.p(ctx2, dirty);
            if (dirty & /*$$slots*/
            32) {
              transition_in(if_block2, 1);
            }
          } else {
            if_block2 = create_if_block5(ctx2);
            if_block2.c();
            transition_in(if_block2, 1);
            if_block2.m(div1, null);
          }
        } else if (if_block2) {
          group_outros();
          transition_out(if_block2, 1, 1, () => {
            if_block2 = null;
          });
          check_outros();
        }
        if (!current || dirty & /*active*/
        4) {
          toggle_class(
            div1,
            "active",
            /*active*/
            ctx2[2]
          );
        }
        if (!current || dirty & /*clickable*/
        8) {
          toggle_class(
            div1,
            "clickable",
            /*clickable*/
            ctx2[3]
          );
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(if_block0);
        transition_in(if_block1);
        transition_in(if_block2);
        current = true;
      },
      o(local) {
        transition_out(if_block0);
        transition_out(if_block1);
        transition_out(if_block2);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div1);
        }
        if (if_block0)
          if_block0.d();
        if_blocks[current_block_type_index].d();
        if (if_block2)
          if_block2.d();
        mounted = false;
        dispose();
      }
    };
  }
  function instance35($$self, $$props, $$invalidate) {
    let { $$slots: slots = {}, $$scope } = $$props;
    const $$slots = compute_slots(slots);
    let { primary = "" } = $$props;
    let { secondary = "" } = $$props;
    let { active = false } = $$props;
    let { clickable = true } = $$props;
    const dispatch2 = createEventDispatcher();
    function onClick() {
      if (clickable) {
        dispatch2("click");
      }
    }
    $$self.$$set = ($$props2) => {
      if ("primary" in $$props2)
        $$invalidate(0, primary = $$props2.primary);
      if ("secondary" in $$props2)
        $$invalidate(1, secondary = $$props2.secondary);
      if ("active" in $$props2)
        $$invalidate(2, active = $$props2.active);
      if ("clickable" in $$props2)
        $$invalidate(3, clickable = $$props2.clickable);
      if ("$$scope" in $$props2)
        $$invalidate(6, $$scope = $$props2.$$scope);
    };
    return [primary, secondary, active, clickable, onClick, $$slots, $$scope, slots];
  }
  var ListItem = class extends SvelteComponent {
    constructor(options) {
      super();
      init(
        this,
        options,
        instance35,
        create_fragment35,
        safe_not_equal,
        {
          primary: 0,
          secondary: 1,
          active: 2,
          clickable: 3
        },
        add_css9
      );
    }
  };
  var ListItem_default = ListItem;

  // packages/ui/src/components/menu/PopoverMenu.svelte
  function add_css10(target) {
    append_styles(target, "svelte-lcnz7g", ".popover-wrapper.svelte-lcnz7g{position:relative}.popover-trigger.svelte-lcnz7g{background:none;border:none;box-shadow:none;color:var(--text-muted);cursor:pointer;padding:0.375rem;border-radius:0.25rem;display:flex;align-items:center;justify-content:center}.popover-trigger.svelte-lcnz7g:hover{color:var(--text-normal)}.popover-panel.svelte-lcnz7g{position:absolute;right:0;top:100%;z-index:10;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:0.375rem;padding:0.25rem;min-width:7.5rem;box-shadow:0 0.25rem 1rem rgba(0, 0, 0, 0.4)}.popover-item.svelte-lcnz7g{display:block;width:100%;padding:0.375rem 0.75rem;border:none;background:none;box-shadow:none;color:var(--text-normal);font-size:0.8125rem;cursor:pointer;border-radius:0.25rem;text-align:left}.popover-item.svelte-lcnz7g:hover{background:var(--background-modifier-hover)}.popover-item.danger.svelte-lcnz7g{color:var(--text-error, #e93147)}.popover-item.danger.svelte-lcnz7g:hover{background:rgba(233, 49, 71, 0.1)}");
  }
  function get_each_context2(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[6] = list[i];
    return child_ctx;
  }
  function create_if_block6(ctx) {
    let div;
    let each_value = ensure_array_like(
      /*items*/
      ctx[1]
    );
    let each_blocks = [];
    for (let i = 0; i < each_value.length; i += 1) {
      each_blocks[i] = create_each_block2(get_each_context2(ctx, each_value, i));
    }
    return {
      c() {
        div = element("div");
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        attr(div, "class", "popover-panel svelte-lcnz7g");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(div, null);
          }
        }
      },
      p(ctx2, dirty) {
        if (dirty & /*items, onItemClick*/
        10) {
          each_value = ensure_array_like(
            /*items*/
            ctx2[1]
          );
          let i;
          for (i = 0; i < each_value.length; i += 1) {
            const child_ctx = get_each_context2(ctx2, each_value, i);
            if (each_blocks[i]) {
              each_blocks[i].p(child_ctx, dirty);
            } else {
              each_blocks[i] = create_each_block2(child_ctx);
              each_blocks[i].c();
              each_blocks[i].m(div, null);
            }
          }
          for (; i < each_blocks.length; i += 1) {
            each_blocks[i].d(1);
          }
          each_blocks.length = each_value.length;
        }
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        destroy_each(each_blocks, detaching);
      }
    };
  }
  function create_each_block2(ctx) {
    let button;
    let t0_value = (
      /*item*/
      ctx[6].label + ""
    );
    let t0;
    let t1;
    let mounted;
    let dispose;
    function click_handler(...args) {
      return (
        /*click_handler*/
        ctx[4](
          /*item*/
          ctx[6],
          ...args
        )
      );
    }
    return {
      c() {
        button = element("button");
        t0 = text(t0_value);
        t1 = space();
        attr(button, "class", "popover-item svelte-lcnz7g");
        toggle_class(
          button,
          "danger",
          /*item*/
          ctx[6].danger
        );
      },
      m(target, anchor) {
        insert(target, button, anchor);
        append(button, t0);
        append(button, t1);
        if (!mounted) {
          dispose = listen(button, "click", click_handler);
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (dirty & /*items*/
        2 && t0_value !== (t0_value = /*item*/
        ctx[6].label + ""))
          set_data(t0, t0_value);
        if (dirty & /*items*/
        2) {
          toggle_class(
            button,
            "danger",
            /*item*/
            ctx[6].danger
          );
        }
      },
      d(detaching) {
        if (detaching) {
          detach(button);
        }
        mounted = false;
        dispose();
      }
    };
  }
  function create_fragment36(ctx) {
    let div;
    let button;
    let ellipsisvertical;
    let t;
    let current;
    let mounted;
    let dispose;
    ellipsisvertical = new ellipsis_vertical_default({ props: { size: "1rem" } });
    let if_block = (
      /*open*/
      ctx[0] && create_if_block6(ctx)
    );
    return {
      c() {
        div = element("div");
        button = element("button");
        create_component(ellipsisvertical.$$.fragment);
        t = space();
        if (if_block)
          if_block.c();
        attr(button, "class", "popover-trigger svelte-lcnz7g");
        attr(button, "title", "Options");
        attr(div, "class", "popover-wrapper svelte-lcnz7g");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, button);
        mount_component(ellipsisvertical, button, null);
        append(div, t);
        if (if_block)
          if_block.m(div, null);
        current = true;
        if (!mounted) {
          dispose = listen(
            button,
            "click",
            /*onTriggerClick*/
            ctx[2]
          );
          mounted = true;
        }
      },
      p(ctx2, [dirty]) {
        if (
          /*open*/
          ctx2[0]
        ) {
          if (if_block) {
            if_block.p(ctx2, dirty);
          } else {
            if_block = create_if_block6(ctx2);
            if_block.c();
            if_block.m(div, null);
          }
        } else if (if_block) {
          if_block.d(1);
          if_block = null;
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(ellipsisvertical.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(ellipsisvertical.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        destroy_component(ellipsisvertical);
        if (if_block)
          if_block.d();
        mounted = false;
        dispose();
      }
    };
  }
  function instance36($$self, $$props, $$invalidate) {
    let { open = false } = $$props;
    let { items = [] } = $$props;
    const dispatch2 = createEventDispatcher();
    function onTriggerClick(e) {
      e.stopPropagation();
      dispatch2("toggle");
    }
    function onItemClick(e, item) {
      e.stopPropagation();
      dispatch2("select", item);
    }
    const click_handler = (item, e) => onItemClick(e, item);
    $$self.$$set = ($$props2) => {
      if ("open" in $$props2)
        $$invalidate(0, open = $$props2.open);
      if ("items" in $$props2)
        $$invalidate(1, items = $$props2.items);
    };
    return [open, items, onTriggerClick, onItemClick, click_handler];
  }
  var PopoverMenu = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance36, create_fragment36, safe_not_equal, { open: 0, items: 1 }, add_css10);
    }
  };
  var PopoverMenu_default = PopoverMenu;

  // packages/ui/src/views/admin/UserList.svelte
  function add_css11(target) {
    append_styles(target, "svelte-1sg9a8k", ".user-list.svelte-1sg9a8k.svelte-1sg9a8k{display:flex;flex-direction:column;gap:0.75rem}.list-header.svelte-1sg9a8k.svelte-1sg9a8k{display:flex;justify-content:space-between;align-items:center}.list-header.svelte-1sg9a8k h3.svelte-1sg9a8k{margin:0;font-size:1rem;color:var(--text-normal)}.create-form.svelte-1sg9a8k.svelte-1sg9a8k{display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;padding:0.75rem;background:var(--background-primary-alt);border-radius:8px}.create-form.svelte-1sg9a8k input.svelte-1sg9a8k,.create-form.svelte-1sg9a8k select.svelte-1sg9a8k,.table.svelte-1sg9a8k select.svelte-1sg9a8k,.table.svelte-1sg9a8k input.svelte-1sg9a8k{padding:6px 10px;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:6px;color:var(--text-normal);font-size:0.8125rem;outline:none}.create-form.svelte-1sg9a8k input.svelte-1sg9a8k{width:140px}.create-form.svelte-1sg9a8k select.svelte-1sg9a8k{width:110px}.table.svelte-1sg9a8k select.svelte-1sg9a8k{width:110px}.table.svelte-1sg9a8k input.svelte-1sg9a8k{width:130px}.form-actions.svelte-1sg9a8k.svelte-1sg9a8k{display:flex;gap:0.25rem}.form-error.svelte-1sg9a8k.svelte-1sg9a8k{width:100%;color:var(--text-error);font-size:0.75rem}.table.svelte-1sg9a8k.svelte-1sg9a8k{display:flex;flex-direction:column}.table-row.svelte-1sg9a8k.svelte-1sg9a8k{display:flex;align-items:center;gap:0.75rem;padding:0.625rem 0.5rem;border-bottom:1px solid var(--background-modifier-border-hover);font-size:0.8125rem}.table-row.header.svelte-1sg9a8k.svelte-1sg9a8k{font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--background-modifier-border)}.table-row.editing.svelte-1sg9a8k.svelte-1sg9a8k{background:var(--background-primary-alt);border-radius:6px;flex-wrap:wrap}.col-user.svelte-1sg9a8k.svelte-1sg9a8k{flex:2;display:flex;flex-direction:column;gap:1px;min-width:0}.created.svelte-1sg9a8k.svelte-1sg9a8k{font-size:0.6875rem;color:var(--text-faint)}.col-role.svelte-1sg9a8k.svelte-1sg9a8k{flex:1}.col-password.svelte-1sg9a8k.svelte-1sg9a8k{flex:1}.col-actions.svelte-1sg9a8k.svelte-1sg9a8k{display:flex;gap:0.25rem;justify-content:flex-end}.badge.svelte-1sg9a8k.svelte-1sg9a8k{display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.6875rem;font-weight:600;text-transform:uppercase}.badge-admin.svelte-1sg9a8k.svelte-1sg9a8k{background:rgba(124, 58, 237, 0.2);color:#a78bfa}.badge-editor.svelte-1sg9a8k.svelte-1sg9a8k{background:rgba(59, 130, 246, 0.2);color:#93c5fd}.badge-reader.svelte-1sg9a8k.svelte-1sg9a8k{background:rgba(107, 114, 128, 0.2);color:#9ca3af}");
  }
  function get_each_context3(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[28] = list[i];
    return child_ctx;
  }
  function get_each_context_1(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[31] = list[i];
    return child_ctx;
  }
  function get_each_context_2(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[31] = list[i];
    return child_ctx;
  }
  function create_default_slot_3(ctx) {
    let t;
    return {
      c() {
        t = text("Add User");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_icon_slot_5(ctx) {
    let userplus;
    let current;
    userplus = new user_plus_default({ props: { size: "0.875rem" } });
    return {
      c() {
        create_component(userplus.$$.fragment);
      },
      m(target, anchor) {
        mount_component(userplus, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(userplus.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(userplus.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(userplus, detaching);
      }
    };
  }
  function create_if_block_22(ctx) {
    let div1;
    let input0;
    let t0;
    let input1;
    let t1;
    let select;
    let t2;
    let div0;
    let button0;
    let t3;
    let button1;
    let t4;
    let current;
    let mounted;
    let dispose;
    let each_value_2 = ensure_array_like(
      /*roleOptions*/
      ctx[10]
    );
    let each_blocks = [];
    for (let i = 0; i < each_value_2.length; i += 1) {
      each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    }
    button0 = new Button_default({
      props: {
        variant: "ghost",
        size: "small",
        $$slots: { icon: [create_icon_slot_4] },
        $$scope: { ctx }
      }
    });
    button0.$on(
      "click",
      /*click_handler_1*/
      ctx[22]
    );
    button1 = new Button_default({
      props: {
        variant: "primary",
        size: "small",
        $$slots: {
          icon: [create_icon_slot_3],
          default: [create_default_slot_23]
        },
        $$scope: { ctx }
      }
    });
    button1.$on(
      "click",
      /*handleCreate*/
      ctx[11]
    );
    let if_block = (
      /*createError*/
      ctx[5] && create_if_block_32(ctx)
    );
    return {
      c() {
        div1 = element("div");
        input0 = element("input");
        t0 = space();
        input1 = element("input");
        t1 = space();
        select = element("select");
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        t2 = space();
        div0 = element("div");
        create_component(button0.$$.fragment);
        t3 = space();
        create_component(button1.$$.fragment);
        t4 = space();
        if (if_block)
          if_block.c();
        attr(input0, "type", "text");
        attr(input0, "placeholder", "Username");
        attr(input0, "class", "svelte-1sg9a8k");
        attr(input1, "type", "password");
        attr(input1, "placeholder", "Password");
        attr(input1, "class", "svelte-1sg9a8k");
        attr(select, "class", "svelte-1sg9a8k");
        if (
          /*createRole*/
          ctx[4] === void 0
        )
          add_render_callback(() => (
            /*select_change_handler*/
            ctx[21].call(select)
          ));
        attr(div0, "class", "form-actions svelte-1sg9a8k");
        attr(div1, "class", "create-form svelte-1sg9a8k");
      },
      m(target, anchor) {
        insert(target, div1, anchor);
        append(div1, input0);
        set_input_value(
          input0,
          /*createUsername*/
          ctx[2]
        );
        append(div1, t0);
        append(div1, input1);
        set_input_value(
          input1,
          /*createPassword*/
          ctx[3]
        );
        append(div1, t1);
        append(div1, select);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(select, null);
          }
        }
        select_option(
          select,
          /*createRole*/
          ctx[4],
          true
        );
        append(div1, t2);
        append(div1, div0);
        mount_component(button0, div0, null);
        append(div0, t3);
        mount_component(button1, div0, null);
        append(div1, t4);
        if (if_block)
          if_block.m(div1, null);
        current = true;
        if (!mounted) {
          dispose = [
            listen(
              input0,
              "input",
              /*input0_input_handler*/
              ctx[19]
            ),
            listen(
              input1,
              "input",
              /*input1_input_handler*/
              ctx[20]
            ),
            listen(
              select,
              "change",
              /*select_change_handler*/
              ctx[21]
            )
          ];
          mounted = true;
        }
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*createUsername*/
        4 && input0.value !== /*createUsername*/
        ctx2[2]) {
          set_input_value(
            input0,
            /*createUsername*/
            ctx2[2]
          );
        }
        if (dirty[0] & /*createPassword*/
        8 && input1.value !== /*createPassword*/
        ctx2[3]) {
          set_input_value(
            input1,
            /*createPassword*/
            ctx2[3]
          );
        }
        if (dirty[0] & /*roleOptions*/
        1024) {
          each_value_2 = ensure_array_like(
            /*roleOptions*/
            ctx2[10]
          );
          let i;
          for (i = 0; i < each_value_2.length; i += 1) {
            const child_ctx = get_each_context_2(ctx2, each_value_2, i);
            if (each_blocks[i]) {
              each_blocks[i].p(child_ctx, dirty);
            } else {
              each_blocks[i] = create_each_block_2(child_ctx);
              each_blocks[i].c();
              each_blocks[i].m(select, null);
            }
          }
          for (; i < each_blocks.length; i += 1) {
            each_blocks[i].d(1);
          }
          each_blocks.length = each_value_2.length;
        }
        if (dirty[0] & /*createRole, roleOptions*/
        1040) {
          select_option(
            select,
            /*createRole*/
            ctx2[4]
          );
        }
        const button0_changes = {};
        if (dirty[1] & /*$$scope*/
        32) {
          button0_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button0.$set(button0_changes);
        const button1_changes = {};
        if (dirty[1] & /*$$scope*/
        32) {
          button1_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button1.$set(button1_changes);
        if (
          /*createError*/
          ctx2[5]
        ) {
          if (if_block) {
            if_block.p(ctx2, dirty);
          } else {
            if_block = create_if_block_32(ctx2);
            if_block.c();
            if_block.m(div1, null);
          }
        } else if (if_block) {
          if_block.d(1);
          if_block = null;
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(button0.$$.fragment, local);
        transition_in(button1.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(button0.$$.fragment, local);
        transition_out(button1.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div1);
        }
        destroy_each(each_blocks, detaching);
        destroy_component(button0);
        destroy_component(button1);
        if (if_block)
          if_block.d();
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function create_each_block_2(ctx) {
    let option;
    let t_value = (
      /*ro*/
      ctx[31] + ""
    );
    let t;
    let option_value_value;
    return {
      c() {
        option = element("option");
        t = text(t_value);
        option.__value = option_value_value = /*ro*/
        ctx[31];
        set_input_value(option, option.__value);
      },
      m(target, anchor) {
        insert(target, option, anchor);
        append(option, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*roleOptions*/
        1024 && t_value !== (t_value = /*ro*/
        ctx2[31] + ""))
          set_data(t, t_value);
        if (dirty[0] & /*roleOptions*/
        1024 && option_value_value !== (option_value_value = /*ro*/
        ctx2[31])) {
          option.__value = option_value_value;
          set_input_value(option, option.__value);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(option);
        }
      }
    };
  }
  function create_icon_slot_4(ctx) {
    let x3;
    let current;
    x3 = new x_default({ props: { size: "0.875rem" } });
    return {
      c() {
        create_component(x3.$$.fragment);
      },
      m(target, anchor) {
        mount_component(x3, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(x3.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(x3.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(x3, detaching);
      }
    };
  }
  function create_default_slot_23(ctx) {
    let t;
    return {
      c() {
        t = text("Create");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_icon_slot_3(ctx) {
    let check;
    let current;
    check = new check_default({ props: { size: "0.875rem" } });
    return {
      c() {
        create_component(check.$$.fragment);
      },
      m(target, anchor) {
        mount_component(check, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(check.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(check.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(check, detaching);
      }
    };
  }
  function create_if_block_32(ctx) {
    let div;
    let t;
    return {
      c() {
        div = element("div");
        t = text(
          /*createError*/
          ctx[5]
        );
        attr(div, "class", "form-error svelte-1sg9a8k");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*createError*/
        32)
          set_data(
            t,
            /*createError*/
            ctx2[5]
          );
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_else_block2(ctx) {
    let div;
    let span1;
    let strong;
    let t0_value = (
      /*user*/
      ctx[28].username + ""
    );
    let t0;
    let t1;
    let span0;
    let t2_value = new Date(
      /*user*/
      ctx[28].createdAt
    ).toLocaleDateString() + "";
    let t2;
    let t3;
    let span3;
    let span2;
    let t4_value = (
      /*roleBadge*/
      ctx[15](
        /*user*/
        ctx[28].role
      ) + ""
    );
    let t4;
    let span2_class_value;
    let t5;
    let span4;
    let button0;
    let t6;
    let button1;
    let t7;
    let current;
    function click_handler_3() {
      return (
        /*click_handler_3*/
        ctx[26](
          /*user*/
          ctx[28]
        )
      );
    }
    button0 = new Button_default({
      props: {
        variant: "ghost",
        size: "small",
        $$slots: { default: [create_default_slot_14] },
        $$scope: { ctx }
      }
    });
    button0.$on("click", click_handler_3);
    function click_handler_4() {
      return (
        /*click_handler_4*/
        ctx[27](
          /*user*/
          ctx[28]
        )
      );
    }
    button1 = new Button_default({
      props: {
        variant: "ghost-danger",
        size: "small",
        $$slots: { icon: [create_icon_slot_2] },
        $$scope: { ctx }
      }
    });
    button1.$on("click", click_handler_4);
    return {
      c() {
        div = element("div");
        span1 = element("span");
        strong = element("strong");
        t0 = text(t0_value);
        t1 = space();
        span0 = element("span");
        t2 = text(t2_value);
        t3 = space();
        span3 = element("span");
        span2 = element("span");
        t4 = text(t4_value);
        t5 = space();
        span4 = element("span");
        create_component(button0.$$.fragment);
        t6 = space();
        create_component(button1.$$.fragment);
        t7 = space();
        attr(span0, "class", "created svelte-1sg9a8k");
        attr(span1, "class", "col-user svelte-1sg9a8k");
        attr(span2, "class", span2_class_value = "badge badge-" + /*user*/
        ctx[28].role + " svelte-1sg9a8k");
        attr(span3, "class", "col-role svelte-1sg9a8k");
        attr(span4, "class", "col-actions svelte-1sg9a8k");
        attr(div, "class", "table-row svelte-1sg9a8k");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, span1);
        append(span1, strong);
        append(strong, t0);
        append(span1, t1);
        append(span1, span0);
        append(span0, t2);
        append(div, t3);
        append(div, span3);
        append(span3, span2);
        append(span2, t4);
        append(div, t5);
        append(div, span4);
        mount_component(button0, span4, null);
        append(span4, t6);
        mount_component(button1, span4, null);
        append(div, t7);
        current = true;
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if ((!current || dirty[0] & /*users*/
        1) && t0_value !== (t0_value = /*user*/
        ctx[28].username + ""))
          set_data(t0, t0_value);
        if ((!current || dirty[0] & /*users*/
        1) && t2_value !== (t2_value = new Date(
          /*user*/
          ctx[28].createdAt
        ).toLocaleDateString() + ""))
          set_data(t2, t2_value);
        if ((!current || dirty[0] & /*users*/
        1) && t4_value !== (t4_value = /*roleBadge*/
        ctx[15](
          /*user*/
          ctx[28].role
        ) + ""))
          set_data(t4, t4_value);
        if (!current || dirty[0] & /*users*/
        1 && span2_class_value !== (span2_class_value = "badge badge-" + /*user*/
        ctx[28].role + " svelte-1sg9a8k")) {
          attr(span2, "class", span2_class_value);
        }
        const button0_changes = {};
        if (dirty[1] & /*$$scope*/
        32) {
          button0_changes.$$scope = { dirty, ctx };
        }
        button0.$set(button0_changes);
        const button1_changes = {};
        if (dirty[1] & /*$$scope*/
        32) {
          button1_changes.$$scope = { dirty, ctx };
        }
        button1.$set(button1_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(button0.$$.fragment, local);
        transition_in(button1.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(button0.$$.fragment, local);
        transition_out(button1.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        destroy_component(button0);
        destroy_component(button1);
      }
    };
  }
  function create_if_block7(ctx) {
    let div;
    let span0;
    let t0_value = (
      /*user*/
      ctx[28].username + ""
    );
    let t0;
    let t1;
    let span1;
    let select;
    let t2;
    let span2;
    let input;
    let t3;
    let span3;
    let button0;
    let t4;
    let button1;
    let t5;
    let t6;
    let current;
    let mounted;
    let dispose;
    let each_value_1 = ensure_array_like(
      /*roleOptions*/
      ctx[10]
    );
    let each_blocks = [];
    for (let i = 0; i < each_value_1.length; i += 1) {
      each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    }
    button0 = new Button_default({
      props: {
        variant: "ghost",
        size: "small",
        $$slots: { icon: [create_icon_slot_13] },
        $$scope: { ctx }
      }
    });
    button0.$on(
      "click",
      /*click_handler_2*/
      ctx[25]
    );
    button1 = new Button_default({
      props: {
        variant: "primary",
        size: "small",
        $$slots: {
          icon: [create_icon_slot4],
          default: [create_default_slot30]
        },
        $$scope: { ctx }
      }
    });
    button1.$on(
      "click",
      /*handleEdit*/
      ctx[13]
    );
    let if_block = (
      /*editError*/
      ctx[9] && create_if_block_13(ctx)
    );
    return {
      c() {
        div = element("div");
        span0 = element("span");
        t0 = text(t0_value);
        t1 = space();
        span1 = element("span");
        select = element("select");
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        t2 = space();
        span2 = element("span");
        input = element("input");
        t3 = space();
        span3 = element("span");
        create_component(button0.$$.fragment);
        t4 = space();
        create_component(button1.$$.fragment);
        t5 = space();
        if (if_block)
          if_block.c();
        t6 = space();
        attr(span0, "class", "col-user svelte-1sg9a8k");
        attr(select, "class", "svelte-1sg9a8k");
        if (
          /*editRole*/
          ctx[7] === void 0
        )
          add_render_callback(() => (
            /*select_change_handler_1*/
            ctx[23].call(select)
          ));
        attr(span1, "class", "col-role svelte-1sg9a8k");
        attr(input, "type", "password");
        attr(input, "placeholder", "New password");
        attr(input, "class", "svelte-1sg9a8k");
        attr(span2, "class", "col-password svelte-1sg9a8k");
        attr(span3, "class", "col-actions svelte-1sg9a8k");
        attr(div, "class", "table-row editing svelte-1sg9a8k");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, span0);
        append(span0, t0);
        append(div, t1);
        append(div, span1);
        append(span1, select);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(select, null);
          }
        }
        select_option(
          select,
          /*editRole*/
          ctx[7],
          true
        );
        append(div, t2);
        append(div, span2);
        append(span2, input);
        set_input_value(
          input,
          /*editPassword*/
          ctx[8]
        );
        append(div, t3);
        append(div, span3);
        mount_component(button0, span3, null);
        append(span3, t4);
        mount_component(button1, span3, null);
        append(div, t5);
        if (if_block)
          if_block.m(div, null);
        append(div, t6);
        current = true;
        if (!mounted) {
          dispose = [
            listen(
              select,
              "change",
              /*select_change_handler_1*/
              ctx[23]
            ),
            listen(
              input,
              "input",
              /*input_input_handler*/
              ctx[24]
            )
          ];
          mounted = true;
        }
      },
      p(ctx2, dirty) {
        if ((!current || dirty[0] & /*users*/
        1) && t0_value !== (t0_value = /*user*/
        ctx2[28].username + ""))
          set_data(t0, t0_value);
        if (dirty[0] & /*roleOptions*/
        1024) {
          each_value_1 = ensure_array_like(
            /*roleOptions*/
            ctx2[10]
          );
          let i;
          for (i = 0; i < each_value_1.length; i += 1) {
            const child_ctx = get_each_context_1(ctx2, each_value_1, i);
            if (each_blocks[i]) {
              each_blocks[i].p(child_ctx, dirty);
            } else {
              each_blocks[i] = create_each_block_1(child_ctx);
              each_blocks[i].c();
              each_blocks[i].m(select, null);
            }
          }
          for (; i < each_blocks.length; i += 1) {
            each_blocks[i].d(1);
          }
          each_blocks.length = each_value_1.length;
        }
        if (dirty[0] & /*editRole, roleOptions*/
        1152) {
          select_option(
            select,
            /*editRole*/
            ctx2[7]
          );
        }
        if (dirty[0] & /*editPassword*/
        256 && input.value !== /*editPassword*/
        ctx2[8]) {
          set_input_value(
            input,
            /*editPassword*/
            ctx2[8]
          );
        }
        const button0_changes = {};
        if (dirty[1] & /*$$scope*/
        32) {
          button0_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button0.$set(button0_changes);
        const button1_changes = {};
        if (dirty[1] & /*$$scope*/
        32) {
          button1_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button1.$set(button1_changes);
        if (
          /*editError*/
          ctx2[9]
        ) {
          if (if_block) {
            if_block.p(ctx2, dirty);
          } else {
            if_block = create_if_block_13(ctx2);
            if_block.c();
            if_block.m(div, t6);
          }
        } else if (if_block) {
          if_block.d(1);
          if_block = null;
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(button0.$$.fragment, local);
        transition_in(button1.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(button0.$$.fragment, local);
        transition_out(button1.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        destroy_each(each_blocks, detaching);
        destroy_component(button0);
        destroy_component(button1);
        if (if_block)
          if_block.d();
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function create_default_slot_14(ctx) {
    let t;
    return {
      c() {
        t = text("Edit");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_icon_slot_2(ctx) {
    let trash2;
    let current;
    trash2 = new trash_2_default({ props: { size: "0.875rem" } });
    return {
      c() {
        create_component(trash2.$$.fragment);
      },
      m(target, anchor) {
        mount_component(trash2, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(trash2.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(trash2.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(trash2, detaching);
      }
    };
  }
  function create_each_block_1(ctx) {
    let option;
    let t_value = (
      /*ro*/
      ctx[31] + ""
    );
    let t;
    let option_value_value;
    return {
      c() {
        option = element("option");
        t = text(t_value);
        option.__value = option_value_value = /*ro*/
        ctx[31];
        set_input_value(option, option.__value);
      },
      m(target, anchor) {
        insert(target, option, anchor);
        append(option, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*roleOptions*/
        1024 && t_value !== (t_value = /*ro*/
        ctx2[31] + ""))
          set_data(t, t_value);
        if (dirty[0] & /*roleOptions*/
        1024 && option_value_value !== (option_value_value = /*ro*/
        ctx2[31])) {
          option.__value = option_value_value;
          set_input_value(option, option.__value);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(option);
        }
      }
    };
  }
  function create_icon_slot_13(ctx) {
    let x3;
    let current;
    x3 = new x_default({ props: { size: "0.875rem" } });
    return {
      c() {
        create_component(x3.$$.fragment);
      },
      m(target, anchor) {
        mount_component(x3, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(x3.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(x3.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(x3, detaching);
      }
    };
  }
  function create_default_slot30(ctx) {
    let t;
    return {
      c() {
        t = text("Save");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_icon_slot4(ctx) {
    let check;
    let current;
    check = new check_default({ props: { size: "0.875rem" } });
    return {
      c() {
        create_component(check.$$.fragment);
      },
      m(target, anchor) {
        mount_component(check, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(check.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(check.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(check, detaching);
      }
    };
  }
  function create_if_block_13(ctx) {
    let div;
    let t;
    return {
      c() {
        div = element("div");
        t = text(
          /*editError*/
          ctx[9]
        );
        attr(div, "class", "form-error svelte-1sg9a8k");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*editError*/
        512)
          set_data(
            t,
            /*editError*/
            ctx2[9]
          );
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_each_block3(key_1, ctx) {
    let first;
    let current_block_type_index;
    let if_block;
    let if_block_anchor;
    let current;
    const if_block_creators = [create_if_block7, create_else_block2];
    const if_blocks = [];
    function select_block_type(ctx2, dirty) {
      if (
        /*editingUser*/
        ctx2[6] && /*editingUser*/
        ctx2[6].username === /*user*/
        ctx2[28].username
      )
        return 0;
      return 1;
    }
    current_block_type_index = select_block_type(ctx, [-1, -1]);
    if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    return {
      key: key_1,
      first: null,
      c() {
        first = empty();
        if_block.c();
        if_block_anchor = empty();
        this.first = first;
      },
      m(target, anchor) {
        insert(target, first, anchor);
        if_blocks[current_block_type_index].m(target, anchor);
        insert(target, if_block_anchor, anchor);
        current = true;
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        let previous_block_index = current_block_type_index;
        current_block_type_index = select_block_type(ctx, dirty);
        if (current_block_type_index === previous_block_index) {
          if_blocks[current_block_type_index].p(ctx, dirty);
        } else {
          group_outros();
          transition_out(if_blocks[previous_block_index], 1, 1, () => {
            if_blocks[previous_block_index] = null;
          });
          check_outros();
          if_block = if_blocks[current_block_type_index];
          if (!if_block) {
            if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
            if_block.c();
          } else {
            if_block.p(ctx, dirty);
          }
          transition_in(if_block, 1);
          if_block.m(if_block_anchor.parentNode, if_block_anchor);
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(if_block);
        current = true;
      },
      o(local) {
        transition_out(if_block);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(first);
          detach(if_block_anchor);
        }
        if_blocks[current_block_type_index].d(detaching);
      }
    };
  }
  function create_fragment37(ctx) {
    let div3;
    let div0;
    let h3;
    let t0;
    let t1_value = (
      /*users*/
      ctx[0].length + ""
    );
    let t1;
    let t2;
    let t3;
    let button;
    let t4;
    let t5;
    let div2;
    let div1;
    let t10;
    let each_blocks = [];
    let each_1_lookup = /* @__PURE__ */ new Map();
    let current;
    button = new Button_default({
      props: {
        variant: "ghost",
        $$slots: {
          icon: [create_icon_slot_5],
          default: [create_default_slot_3]
        },
        $$scope: { ctx }
      }
    });
    button.$on(
      "click",
      /*click_handler*/
      ctx[18]
    );
    let if_block = (
      /*showCreate*/
      ctx[1] && create_if_block_22(ctx)
    );
    let each_value = ensure_array_like(
      /*users*/
      ctx[0]
    );
    const get_key = (ctx2) => (
      /*user*/
      ctx2[28].username
    );
    for (let i = 0; i < each_value.length; i += 1) {
      let child_ctx = get_each_context3(ctx, each_value, i);
      let key = get_key(child_ctx);
      each_1_lookup.set(key, each_blocks[i] = create_each_block3(key, child_ctx));
    }
    return {
      c() {
        div3 = element("div");
        div0 = element("div");
        h3 = element("h3");
        t0 = text("Users (");
        t1 = text(t1_value);
        t2 = text(")");
        t3 = space();
        create_component(button.$$.fragment);
        t4 = space();
        if (if_block)
          if_block.c();
        t5 = space();
        div2 = element("div");
        div1 = element("div");
        div1.innerHTML = `<span class="col-user svelte-1sg9a8k">User</span> <span class="col-role svelte-1sg9a8k">Role</span> <span class="col-actions svelte-1sg9a8k"></span>`;
        t10 = space();
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        attr(h3, "class", "svelte-1sg9a8k");
        attr(div0, "class", "list-header svelte-1sg9a8k");
        attr(div1, "class", "table-row header svelte-1sg9a8k");
        attr(div2, "class", "table svelte-1sg9a8k");
        attr(div3, "class", "user-list svelte-1sg9a8k");
      },
      m(target, anchor) {
        insert(target, div3, anchor);
        append(div3, div0);
        append(div0, h3);
        append(h3, t0);
        append(h3, t1);
        append(h3, t2);
        append(div0, t3);
        mount_component(button, div0, null);
        append(div3, t4);
        if (if_block)
          if_block.m(div3, null);
        append(div3, t5);
        append(div3, div2);
        append(div2, div1);
        append(div2, t10);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(div2, null);
          }
        }
        current = true;
      },
      p(ctx2, dirty) {
        if ((!current || dirty[0] & /*users*/
        1) && t1_value !== (t1_value = /*users*/
        ctx2[0].length + ""))
          set_data(t1, t1_value);
        const button_changes = {};
        if (dirty[1] & /*$$scope*/
        32) {
          button_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button.$set(button_changes);
        if (
          /*showCreate*/
          ctx2[1]
        ) {
          if (if_block) {
            if_block.p(ctx2, dirty);
            if (dirty[0] & /*showCreate*/
            2) {
              transition_in(if_block, 1);
            }
          } else {
            if_block = create_if_block_22(ctx2);
            if_block.c();
            transition_in(if_block, 1);
            if_block.m(div3, t5);
          }
        } else if (if_block) {
          group_outros();
          transition_out(if_block, 1, 1, () => {
            if_block = null;
          });
          check_outros();
        }
        if (dirty[0] & /*editError, handleEdit, editingUser, editPassword, editRole, roleOptions, users, handleDelete, startEdit, roleBadge*/
        63425) {
          each_value = ensure_array_like(
            /*users*/
            ctx2[0]
          );
          group_outros();
          each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx2, each_value, each_1_lookup, div2, outro_and_destroy_block, create_each_block3, null, get_each_context3);
          check_outros();
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(button.$$.fragment, local);
        transition_in(if_block);
        for (let i = 0; i < each_value.length; i += 1) {
          transition_in(each_blocks[i]);
        }
        current = true;
      },
      o(local) {
        transition_out(button.$$.fragment, local);
        transition_out(if_block);
        for (let i = 0; i < each_blocks.length; i += 1) {
          transition_out(each_blocks[i]);
        }
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div3);
        }
        destroy_component(button);
        if (if_block)
          if_block.d();
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].d();
        }
      }
    };
  }
  function instance37($$self, $$props, $$invalidate) {
    let roleOptions;
    let { users = [] } = $$props;
    let { roles = [] } = $$props;
    let { refresh = () => {
    } } = $$props;
    let showCreate = false;
    let createUsername = "";
    let createPassword = "";
    let createRole = "reader";
    let createError = "";
    let editingUser = null;
    let editRole = "";
    let editPassword = "";
    let editError = "";
    async function handleCreate() {
      $$invalidate(5, createError = "");
      if (!createUsername.trim() || !createPassword) {
        $$invalidate(5, createError = "All fields required");
        return;
      }
      try {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: createUsername.trim(),
            password: createPassword,
            role: createRole
          })
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed");
        }
        $$invalidate(1, showCreate = false);
        $$invalidate(2, createUsername = "");
        $$invalidate(3, createPassword = "");
        $$invalidate(4, createRole = roleOptions[0] || "reader");
        refresh();
      } catch (e) {
        $$invalidate(5, createError = e.message);
      }
    }
    function startEdit(user) {
      $$invalidate(6, editingUser = user);
      $$invalidate(7, editRole = user.role);
      $$invalidate(8, editPassword = "");
      $$invalidate(9, editError = "");
    }
    async function handleEdit() {
      $$invalidate(9, editError = "");
      const body = {};
      if (editRole !== editingUser.role)
        body.role = editRole;
      if (editPassword)
        body.password = editPassword;
      if (Object.keys(body).length === 0) {
        $$invalidate(6, editingUser = null);
        return;
      }
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(editingUser.username)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed");
        }
        $$invalidate(6, editingUser = null);
        refresh();
      } catch (e) {
        $$invalidate(9, editError = e.message);
      }
    }
    async function handleDelete(username) {
      if (!confirm(`Delete user "${username}"?`))
        return;
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed");
        }
        refresh();
      } catch (e) {
        alert(e.message);
      }
    }
    function roleBadge(role) {
      const r = roles.find((rr) => rr.name === role);
      return (r == null ? void 0 : r.displayName) || role;
    }
    const click_handler = () => $$invalidate(1, showCreate = !showCreate);
    function input0_input_handler() {
      createUsername = this.value;
      $$invalidate(2, createUsername);
    }
    function input1_input_handler() {
      createPassword = this.value;
      $$invalidate(3, createPassword);
    }
    function select_change_handler() {
      createRole = select_value(this);
      $$invalidate(4, createRole);
      $$invalidate(10, roleOptions), $$invalidate(16, roles);
    }
    const click_handler_1 = () => {
      $$invalidate(1, showCreate = false);
      $$invalidate(5, createError = "");
    };
    function select_change_handler_1() {
      editRole = select_value(this);
      $$invalidate(7, editRole);
      $$invalidate(10, roleOptions), $$invalidate(16, roles);
    }
    function input_input_handler() {
      editPassword = this.value;
      $$invalidate(8, editPassword);
    }
    const click_handler_2 = () => $$invalidate(6, editingUser = null);
    const click_handler_3 = (user) => startEdit(user);
    const click_handler_4 = (user) => handleDelete(user.username);
    $$self.$$set = ($$props2) => {
      if ("users" in $$props2)
        $$invalidate(0, users = $$props2.users);
      if ("roles" in $$props2)
        $$invalidate(16, roles = $$props2.roles);
      if ("refresh" in $$props2)
        $$invalidate(17, refresh = $$props2.refresh);
    };
    $$self.$$.update = () => {
      if ($$self.$$.dirty[0] & /*roles*/
      65536) {
        $:
          $$invalidate(10, roleOptions = roles.length > 0 ? roles.map((r) => r.name) : ["admin", "editor", "reader"]);
      }
    };
    return [
      users,
      showCreate,
      createUsername,
      createPassword,
      createRole,
      createError,
      editingUser,
      editRole,
      editPassword,
      editError,
      roleOptions,
      handleCreate,
      startEdit,
      handleEdit,
      handleDelete,
      roleBadge,
      roles,
      refresh,
      click_handler,
      input0_input_handler,
      input1_input_handler,
      select_change_handler,
      click_handler_1,
      select_change_handler_1,
      input_input_handler,
      click_handler_2,
      click_handler_3,
      click_handler_4
    ];
  }
  var UserList = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance37, create_fragment37, safe_not_equal, { users: 0, roles: 16, refresh: 17 }, add_css11, [-1, -1]);
    }
  };
  var UserList_default = UserList;

  // packages/ui/src/views/admin/VaultPermissions.svelte
  function add_css12(target) {
    append_styles(target, "svelte-1aq9pf1", '.perm-layout.svelte-1aq9pf1.svelte-1aq9pf1{display:flex;gap:1.5rem;min-height:300px}.vault-list.svelte-1aq9pf1.svelte-1aq9pf1{width:200px;flex-shrink:0;display:flex;flex-direction:column;gap:0.25rem}.vault-list.svelte-1aq9pf1 h3.svelte-1aq9pf1,.perm-detail.svelte-1aq9pf1 h3.svelte-1aq9pf1{margin:0 0 0.5rem 0;font-size:0.875rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px}.vault-item.svelte-1aq9pf1.svelte-1aq9pf1{display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0.75rem;background:none;border:1px solid transparent;border-radius:6px;color:var(--text-normal);font-size:0.8125rem;cursor:pointer;text-align:left}.vault-item.svelte-1aq9pf1.svelte-1aq9pf1:hover{background:var(--background-modifier-hover)}.vault-item.active.svelte-1aq9pf1.svelte-1aq9pf1{background:var(--background-modifier-hover);border-color:var(--interactive-accent)}.restricted-badge.svelte-1aq9pf1.svelte-1aq9pf1{font-size:0.625rem;text-transform:uppercase;color:#f59e0b;background:rgba(245, 158, 11, 0.15);padding:1px 6px;border-radius:4px}.perm-detail.svelte-1aq9pf1.svelte-1aq9pf1{flex:1;display:flex;flex-direction:column}.perm-header.svelte-1aq9pf1.svelte-1aq9pf1{display:flex;justify-content:space-between;align-items:center}.perm-header.svelte-1aq9pf1 h3.svelte-1aq9pf1{margin:0;color:var(--text-normal);text-transform:none;font-size:1rem}.perm-note.svelte-1aq9pf1.svelte-1aq9pf1{font-size:0.75rem;color:var(--text-muted);margin:0.25rem 0 0.75rem 0}.perm-grid.svelte-1aq9pf1.svelte-1aq9pf1{display:flex;gap:1.5rem}.perm-col.svelte-1aq9pf1.svelte-1aq9pf1{flex:1}.perm-col.svelte-1aq9pf1 h4.svelte-1aq9pf1{font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin:0 0 0.25rem 0}.col-desc.svelte-1aq9pf1.svelte-1aq9pf1{font-size:0.6875rem;color:var(--text-faint);margin:0 0 0.5rem 0}.perm-check.svelte-1aq9pf1.svelte-1aq9pf1{display:flex;align-items:center;gap:0.5rem;padding:4px 0;font-size:0.8125rem;cursor:pointer}.perm-check.svelte-1aq9pf1 input[type="checkbox"].svelte-1aq9pf1{accent-color:var(--interactive-accent)}.user-role.svelte-1aq9pf1.svelte-1aq9pf1{font-size:0.625rem;color:var(--text-faint);text-transform:uppercase}.perm-entry.svelte-1aq9pf1.svelte-1aq9pf1{padding:4px 0;font-size:0.8125rem}.perm-actions.svelte-1aq9pf1.svelte-1aq9pf1{display:flex;justify-content:space-between;align-items:center;margin-top:1rem;padding-top:0.75rem;border-top:1px solid var(--background-modifier-border)}.perm-actions-right.svelte-1aq9pf1.svelte-1aq9pf1{display:flex;gap:0.25rem}.empty.svelte-1aq9pf1.svelte-1aq9pf1{color:var(--text-muted);font-size:0.8125rem;padding:2rem 0;text-align:center}.empty-sm.svelte-1aq9pf1.svelte-1aq9pf1{color:var(--text-faint);font-size:0.75rem;font-style:italic}.success.svelte-1aq9pf1.svelte-1aq9pf1{color:#34d399;font-size:0.75rem;margin-bottom:0.5rem;padding:4px 8px;background:rgba(52, 211, 153, 0.1);border-radius:4px}.form-error.svelte-1aq9pf1.svelte-1aq9pf1{color:var(--text-error);font-size:0.75rem;margin-bottom:0.5rem;padding:4px 8px;background:rgba(255, 0, 0, 0.1);border-radius:4px}');
  }
  function get_each_context_22(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[27] = list[i];
    return child_ctx;
  }
  function get_each_context_3(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[27] = list[i];
    return child_ctx;
  }
  function get_each_context4(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[22] = list[i];
    return child_ctx;
  }
  function get_each_context_12(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[22] = list[i];
    return child_ctx;
  }
  function get_each_context_4(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[32] = list[i];
    return child_ctx;
  }
  function create_else_block_5(ctx) {
    let each_blocks = [];
    let each_1_lookup = /* @__PURE__ */ new Map();
    let each_1_anchor;
    let each_value_4 = ensure_array_like(
      /*vaults*/
      ctx[0]
    );
    const get_key = (ctx2) => (
      /*vault*/
      ctx2[32].id
    );
    for (let i = 0; i < each_value_4.length; i += 1) {
      let child_ctx = get_each_context_4(ctx, each_value_4, i);
      let key = get_key(child_ctx);
      each_1_lookup.set(key, each_blocks[i] = create_each_block_4(key, child_ctx));
    }
    return {
      c() {
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        each_1_anchor = empty();
      },
      m(target, anchor) {
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(target, anchor);
          }
        }
        insert(target, each_1_anchor, anchor);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*selectedVault, vaults, selectVault, hasPermission*/
        66053) {
          each_value_4 = ensure_array_like(
            /*vaults*/
            ctx2[0]
          );
          each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx2, each_value_4, each_1_lookup, each_1_anchor.parentNode, destroy_block, create_each_block_4, each_1_anchor, get_each_context_4);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(each_1_anchor);
        }
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].d(detaching);
        }
      }
    };
  }
  function create_if_block_8(ctx) {
    let div;
    return {
      c() {
        div = element("div");
        div.textContent = "No vaults";
        attr(div, "class", "empty svelte-1aq9pf1");
      },
      m(target, anchor) {
        insert(target, div, anchor);
      },
      p: noop,
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_if_block_9(ctx) {
    let span;
    return {
      c() {
        span = element("span");
        span.textContent = "restricted";
        attr(span, "class", "restricted-badge svelte-1aq9pf1");
      },
      m(target, anchor) {
        insert(target, span, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(span);
        }
      }
    };
  }
  function create_each_block_4(key_1, ctx) {
    let button;
    let span;
    let t0_value = (
      /*vault*/
      ctx[32].name + ""
    );
    let t0;
    let t1;
    let show_if = (
      /*hasPermission*/
      ctx[16](
        /*vault*/
        ctx[32].id
      )
    );
    let t2;
    let mounted;
    let dispose;
    let if_block = show_if && create_if_block_9(ctx);
    function click_handler() {
      return (
        /*click_handler*/
        ctx[19](
          /*vault*/
          ctx[32]
        )
      );
    }
    return {
      key: key_1,
      first: null,
      c() {
        var _a;
        button = element("button");
        span = element("span");
        t0 = text(t0_value);
        t1 = space();
        if (if_block)
          if_block.c();
        t2 = space();
        attr(button, "class", "vault-item svelte-1aq9pf1");
        toggle_class(
          button,
          "active",
          /*selectedVault*/
          ((_a = ctx[2]) == null ? void 0 : _a.id) === /*vault*/
          ctx[32].id
        );
        this.first = button;
      },
      m(target, anchor) {
        insert(target, button, anchor);
        append(button, span);
        append(span, t0);
        append(button, t1);
        if (if_block)
          if_block.m(button, null);
        append(button, t2);
        if (!mounted) {
          dispose = listen(button, "click", click_handler);
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        var _a;
        ctx = new_ctx;
        if (dirty[0] & /*vaults*/
        1 && t0_value !== (t0_value = /*vault*/
        ctx[32].name + ""))
          set_data(t0, t0_value);
        if (dirty[0] & /*vaults*/
        1)
          show_if = /*hasPermission*/
          ctx[16](
            /*vault*/
            ctx[32].id
          );
        if (show_if) {
          if (if_block) {
          } else {
            if_block = create_if_block_9(ctx);
            if_block.c();
            if_block.m(button, t2);
          }
        } else if (if_block) {
          if_block.d(1);
          if_block = null;
        }
        if (dirty[0] & /*selectedVault, vaults*/
        5) {
          toggle_class(
            button,
            "active",
            /*selectedVault*/
            ((_a = ctx[2]) == null ? void 0 : _a.id) === /*vault*/
            ctx[32].id
          );
        }
      },
      d(detaching) {
        if (detaching) {
          detach(button);
        }
        if (if_block)
          if_block.d();
        mounted = false;
        dispose();
      }
    };
  }
  function create_else_block3(ctx) {
    let div;
    let h3;
    let t0_value = (
      /*selectedVault*/
      ctx[2].name + ""
    );
    let t0;
    let t1;
    let t2;
    let t3;
    let t4;
    let p;
    let show_if_1;
    let t5;
    let show_if;
    let current_block_type_index;
    let if_block4;
    let if_block4_anchor;
    let current;
    let if_block0 = !/*editing*/
    ctx[3] && create_if_block_7(ctx);
    let if_block1 = (
      /*saved*/
      ctx[7] && create_if_block_6(ctx)
    );
    let if_block2 = (
      /*editError*/
      ctx[6] && create_if_block_5(ctx)
    );
    function select_block_type_2(ctx2, dirty) {
      if (dirty[0] & /*selectedVault, editing*/
      12)
        show_if_1 = null;
      if (show_if_1 == null)
        show_if_1 = !!(!/*hasPermission*/
        ctx2[16](
          /*selectedVault*/
          ctx2[2].id
        ) && !/*editing*/
        ctx2[3]);
      if (show_if_1)
        return create_if_block_4;
      return create_else_block_4;
    }
    let current_block_type = select_block_type_2(ctx, [-1, -1]);
    let if_block3 = current_block_type(ctx);
    const if_block_creators = [create_if_block_14, create_if_block_33];
    const if_blocks = [];
    function select_block_type_3(ctx2, dirty) {
      if (dirty[0] & /*selectedVault*/
      4)
        show_if = null;
      if (
        /*editing*/
        ctx2[3]
      )
        return 0;
      if (show_if == null)
        show_if = !!/*hasPermission*/
        ctx2[16](
          /*selectedVault*/
          ctx2[2].id
        );
      if (show_if)
        return 1;
      return -1;
    }
    if (~(current_block_type_index = select_block_type_3(ctx, [-1, -1]))) {
      if_block4 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    }
    return {
      c() {
        div = element("div");
        h3 = element("h3");
        t0 = text(t0_value);
        t1 = space();
        if (if_block0)
          if_block0.c();
        t2 = space();
        if (if_block1)
          if_block1.c();
        t3 = space();
        if (if_block2)
          if_block2.c();
        t4 = space();
        p = element("p");
        if_block3.c();
        t5 = space();
        if (if_block4)
          if_block4.c();
        if_block4_anchor = empty();
        attr(h3, "class", "svelte-1aq9pf1");
        attr(div, "class", "perm-header svelte-1aq9pf1");
        attr(p, "class", "perm-note svelte-1aq9pf1");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, h3);
        append(h3, t0);
        append(div, t1);
        if (if_block0)
          if_block0.m(div, null);
        insert(target, t2, anchor);
        if (if_block1)
          if_block1.m(target, anchor);
        insert(target, t3, anchor);
        if (if_block2)
          if_block2.m(target, anchor);
        insert(target, t4, anchor);
        insert(target, p, anchor);
        if_block3.m(p, null);
        insert(target, t5, anchor);
        if (~current_block_type_index) {
          if_blocks[current_block_type_index].m(target, anchor);
        }
        insert(target, if_block4_anchor, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        if ((!current || dirty[0] & /*selectedVault*/
        4) && t0_value !== (t0_value = /*selectedVault*/
        ctx2[2].name + ""))
          set_data(t0, t0_value);
        if (!/*editing*/
        ctx2[3]) {
          if (if_block0) {
            if_block0.p(ctx2, dirty);
            if (dirty[0] & /*editing*/
            8) {
              transition_in(if_block0, 1);
            }
          } else {
            if_block0 = create_if_block_7(ctx2);
            if_block0.c();
            transition_in(if_block0, 1);
            if_block0.m(div, null);
          }
        } else if (if_block0) {
          group_outros();
          transition_out(if_block0, 1, 1, () => {
            if_block0 = null;
          });
          check_outros();
        }
        if (
          /*saved*/
          ctx2[7]
        ) {
          if (if_block1) {
          } else {
            if_block1 = create_if_block_6(ctx2);
            if_block1.c();
            if_block1.m(t3.parentNode, t3);
          }
        } else if (if_block1) {
          if_block1.d(1);
          if_block1 = null;
        }
        if (
          /*editError*/
          ctx2[6]
        ) {
          if (if_block2) {
            if_block2.p(ctx2, dirty);
          } else {
            if_block2 = create_if_block_5(ctx2);
            if_block2.c();
            if_block2.m(t4.parentNode, t4);
          }
        } else if (if_block2) {
          if_block2.d(1);
          if_block2 = null;
        }
        if (current_block_type !== (current_block_type = select_block_type_2(ctx2, dirty))) {
          if_block3.d(1);
          if_block3 = current_block_type(ctx2);
          if (if_block3) {
            if_block3.c();
            if_block3.m(p, null);
          }
        }
        let previous_block_index = current_block_type_index;
        current_block_type_index = select_block_type_3(ctx2, dirty);
        if (current_block_type_index === previous_block_index) {
          if (~current_block_type_index) {
            if_blocks[current_block_type_index].p(ctx2, dirty);
          }
        } else {
          if (if_block4) {
            group_outros();
            transition_out(if_blocks[previous_block_index], 1, 1, () => {
              if_blocks[previous_block_index] = null;
            });
            check_outros();
          }
          if (~current_block_type_index) {
            if_block4 = if_blocks[current_block_type_index];
            if (!if_block4) {
              if_block4 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx2);
              if_block4.c();
            } else {
              if_block4.p(ctx2, dirty);
            }
            transition_in(if_block4, 1);
            if_block4.m(if_block4_anchor.parentNode, if_block4_anchor);
          } else {
            if_block4 = null;
          }
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(if_block0);
        transition_in(if_block4);
        current = true;
      },
      o(local) {
        transition_out(if_block0);
        transition_out(if_block4);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div);
          detach(t2);
          detach(t3);
          detach(t4);
          detach(p);
          detach(t5);
          detach(if_block4_anchor);
        }
        if (if_block0)
          if_block0.d();
        if (if_block1)
          if_block1.d(detaching);
        if (if_block2)
          if_block2.d(detaching);
        if_block3.d();
        if (~current_block_type_index) {
          if_blocks[current_block_type_index].d(detaching);
        }
      }
    };
  }
  function create_if_block8(ctx) {
    let div;
    return {
      c() {
        div = element("div");
        div.textContent = "Select a vault to manage permissions";
        attr(div, "class", "empty svelte-1aq9pf1");
      },
      m(target, anchor) {
        insert(target, div, anchor);
      },
      p: noop,
      i: noop,
      o: noop,
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_if_block_7(ctx) {
    let button;
    let current;
    button = new Button_default({
      props: {
        variant: "ghost",
        size: "small",
        $$slots: { default: [create_default_slot_32] },
        $$scope: { ctx }
      }
    });
    button.$on(
      "click",
      /*startEdit*/
      ctx[10]
    );
    return {
      c() {
        create_component(button.$$.fragment);
      },
      m(target, anchor) {
        mount_component(button, target, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        const button_changes = {};
        if (dirty[1] & /*$$scope*/
        16) {
          button_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button.$set(button_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(button.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(button.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(button, detaching);
      }
    };
  }
  function create_default_slot_32(ctx) {
    let t;
    return {
      c() {
        t = text("Edit");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_if_block_6(ctx) {
    let div;
    return {
      c() {
        div = element("div");
        div.textContent = "Permissions saved";
        attr(div, "class", "success svelte-1aq9pf1");
      },
      m(target, anchor) {
        insert(target, div, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_if_block_5(ctx) {
    let div;
    let t;
    return {
      c() {
        div = element("div");
        t = text(
          /*editError*/
          ctx[6]
        );
        attr(div, "class", "form-error svelte-1aq9pf1");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*editError*/
        64)
          set_data(
            t,
            /*editError*/
            ctx2[6]
          );
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_else_block_4(ctx) {
    let t;
    return {
      c() {
        t = text("Only listed users have access to this vault.\n          Admins always have full access.");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_if_block_4(ctx) {
    let t;
    return {
      c() {
        t = text("No restrictions. All users have access based on their role.");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_if_block_33(ctx) {
    var _a, _b;
    let div2;
    let div0;
    let h40;
    let t1;
    let t2;
    let div1;
    let h41;
    let t4;
    let each_value_3 = ensure_array_like(
      /*permissions*/
      ((_a = ctx[1][
        /*selectedVault*/
        ctx[2].id
      ]) == null ? void 0 : _a.editors) || []
    );
    let each_blocks_1 = [];
    for (let i = 0; i < each_value_3.length; i += 1) {
      each_blocks_1[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
    }
    let each0_else = null;
    if (!each_value_3.length) {
      each0_else = create_else_block_3(ctx);
    }
    let each_value_2 = ensure_array_like(
      /*permissions*/
      ((_b = ctx[1][
        /*selectedVault*/
        ctx[2].id
      ]) == null ? void 0 : _b.readers) || []
    );
    let each_blocks = [];
    for (let i = 0; i < each_value_2.length; i += 1) {
      each_blocks[i] = create_each_block_22(get_each_context_22(ctx, each_value_2, i));
    }
    let each1_else = null;
    if (!each_value_2.length) {
      each1_else = create_else_block_2(ctx);
    }
    return {
      c() {
        div2 = element("div");
        div0 = element("div");
        h40 = element("h4");
        h40.textContent = "Editors";
        t1 = space();
        for (let i = 0; i < each_blocks_1.length; i += 1) {
          each_blocks_1[i].c();
        }
        if (each0_else) {
          each0_else.c();
        }
        t2 = space();
        div1 = element("div");
        h41 = element("h4");
        h41.textContent = "Readers";
        t4 = space();
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        if (each1_else) {
          each1_else.c();
        }
        attr(h40, "class", "svelte-1aq9pf1");
        attr(div0, "class", "perm-col svelte-1aq9pf1");
        attr(h41, "class", "svelte-1aq9pf1");
        attr(div1, "class", "perm-col svelte-1aq9pf1");
        attr(div2, "class", "perm-grid svelte-1aq9pf1");
      },
      m(target, anchor) {
        insert(target, div2, anchor);
        append(div2, div0);
        append(div0, h40);
        append(div0, t1);
        for (let i = 0; i < each_blocks_1.length; i += 1) {
          if (each_blocks_1[i]) {
            each_blocks_1[i].m(div0, null);
          }
        }
        if (each0_else) {
          each0_else.m(div0, null);
        }
        append(div2, t2);
        append(div2, div1);
        append(div1, h41);
        append(div1, t4);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(div1, null);
          }
        }
        if (each1_else) {
          each1_else.m(div1, null);
        }
      },
      p(ctx2, dirty) {
        var _a2, _b2;
        if (dirty[0] & /*permissions, selectedVault*/
        6) {
          each_value_3 = ensure_array_like(
            /*permissions*/
            ((_a2 = ctx2[1][
              /*selectedVault*/
              ctx2[2].id
            ]) == null ? void 0 : _a2.editors) || []
          );
          let i;
          for (i = 0; i < each_value_3.length; i += 1) {
            const child_ctx = get_each_context_3(ctx2, each_value_3, i);
            if (each_blocks_1[i]) {
              each_blocks_1[i].p(child_ctx, dirty);
            } else {
              each_blocks_1[i] = create_each_block_3(child_ctx);
              each_blocks_1[i].c();
              each_blocks_1[i].m(div0, null);
            }
          }
          for (; i < each_blocks_1.length; i += 1) {
            each_blocks_1[i].d(1);
          }
          each_blocks_1.length = each_value_3.length;
          if (!each_value_3.length && each0_else) {
            each0_else.p(ctx2, dirty);
          } else if (!each_value_3.length) {
            each0_else = create_else_block_3(ctx2);
            each0_else.c();
            each0_else.m(div0, null);
          } else if (each0_else) {
            each0_else.d(1);
            each0_else = null;
          }
        }
        if (dirty[0] & /*permissions, selectedVault*/
        6) {
          each_value_2 = ensure_array_like(
            /*permissions*/
            ((_b2 = ctx2[1][
              /*selectedVault*/
              ctx2[2].id
            ]) == null ? void 0 : _b2.readers) || []
          );
          let i;
          for (i = 0; i < each_value_2.length; i += 1) {
            const child_ctx = get_each_context_22(ctx2, each_value_2, i);
            if (each_blocks[i]) {
              each_blocks[i].p(child_ctx, dirty);
            } else {
              each_blocks[i] = create_each_block_22(child_ctx);
              each_blocks[i].c();
              each_blocks[i].m(div1, null);
            }
          }
          for (; i < each_blocks.length; i += 1) {
            each_blocks[i].d(1);
          }
          each_blocks.length = each_value_2.length;
          if (!each_value_2.length && each1_else) {
            each1_else.p(ctx2, dirty);
          } else if (!each_value_2.length) {
            each1_else = create_else_block_2(ctx2);
            each1_else.c();
            each1_else.m(div1, null);
          } else if (each1_else) {
            each1_else.d(1);
            each1_else = null;
          }
        }
      },
      i: noop,
      o: noop,
      d(detaching) {
        if (detaching) {
          detach(div2);
        }
        destroy_each(each_blocks_1, detaching);
        if (each0_else)
          each0_else.d();
        destroy_each(each_blocks, detaching);
        if (each1_else)
          each1_else.d();
      }
    };
  }
  function create_if_block_14(ctx) {
    let div2;
    let t0;
    let div1;
    let button0;
    let t1;
    let div0;
    let button1;
    let t2;
    let button2;
    let current;
    function select_block_type_4(ctx2, dirty) {
      if (
        /*nonAdminUsers*/
        ctx2[8].length === 0
      )
        return create_if_block_23;
      return create_else_block_1;
    }
    let current_block_type = select_block_type_4(ctx, [-1, -1]);
    let if_block = current_block_type(ctx);
    button0 = new Button_default({
      props: {
        variant: "ghost-danger",
        size: "small",
        $$slots: { default: [create_default_slot_24] },
        $$scope: { ctx }
      }
    });
    button0.$on(
      "click",
      /*clearPermissions*/
      ctx[15]
    );
    button1 = new Button_default({
      props: {
        variant: "ghost",
        size: "small",
        $$slots: {
          icon: [create_icon_slot_14],
          default: [create_default_slot_15]
        },
        $$scope: { ctx }
      }
    });
    button1.$on(
      "click",
      /*cancelEdit*/
      ctx[14]
    );
    button2 = new Button_default({
      props: {
        variant: "primary",
        size: "small",
        $$slots: {
          icon: [create_icon_slot5],
          default: [create_default_slot31]
        },
        $$scope: { ctx }
      }
    });
    button2.$on(
      "click",
      /*savePermissions*/
      ctx[13]
    );
    return {
      c() {
        div2 = element("div");
        if_block.c();
        t0 = space();
        div1 = element("div");
        create_component(button0.$$.fragment);
        t1 = space();
        div0 = element("div");
        create_component(button1.$$.fragment);
        t2 = space();
        create_component(button2.$$.fragment);
        attr(div0, "class", "perm-actions-right svelte-1aq9pf1");
        attr(div1, "class", "perm-actions svelte-1aq9pf1");
        attr(div2, "class", "perm-editor");
      },
      m(target, anchor) {
        insert(target, div2, anchor);
        if_block.m(div2, null);
        append(div2, t0);
        append(div2, div1);
        mount_component(button0, div1, null);
        append(div1, t1);
        append(div1, div0);
        mount_component(button1, div0, null);
        append(div0, t2);
        mount_component(button2, div0, null);
        current = true;
      },
      p(ctx2, dirty) {
        if_block.p(ctx2, dirty);
        const button0_changes = {};
        if (dirty[1] & /*$$scope*/
        16) {
          button0_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button0.$set(button0_changes);
        const button1_changes = {};
        if (dirty[1] & /*$$scope*/
        16) {
          button1_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button1.$set(button1_changes);
        const button2_changes = {};
        if (dirty[1] & /*$$scope*/
        16) {
          button2_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button2.$set(button2_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(button0.$$.fragment, local);
        transition_in(button1.$$.fragment, local);
        transition_in(button2.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(button0.$$.fragment, local);
        transition_out(button1.$$.fragment, local);
        transition_out(button2.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div2);
        }
        if_block.d();
        destroy_component(button0);
        destroy_component(button1);
        destroy_component(button2);
      }
    };
  }
  function create_else_block_3(ctx) {
    let div;
    return {
      c() {
        div = element("div");
        div.textContent = "None";
        attr(div, "class", "empty-sm svelte-1aq9pf1");
      },
      m(target, anchor) {
        insert(target, div, anchor);
      },
      p: noop,
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_each_block_3(ctx) {
    let div;
    let t_value = (
      /*username*/
      ctx[27] + ""
    );
    let t;
    return {
      c() {
        div = element("div");
        t = text(t_value);
        attr(div, "class", "perm-entry svelte-1aq9pf1");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*permissions, selectedVault*/
        6 && t_value !== (t_value = /*username*/
        ctx2[27] + ""))
          set_data(t, t_value);
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_else_block_2(ctx) {
    let div;
    return {
      c() {
        div = element("div");
        div.textContent = "None";
        attr(div, "class", "empty-sm svelte-1aq9pf1");
      },
      m(target, anchor) {
        insert(target, div, anchor);
      },
      p: noop,
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_each_block_22(ctx) {
    let div;
    let t_value = (
      /*username*/
      ctx[27] + ""
    );
    let t;
    return {
      c() {
        div = element("div");
        t = text(t_value);
        attr(div, "class", "perm-entry svelte-1aq9pf1");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*permissions, selectedVault*/
        6 && t_value !== (t_value = /*username*/
        ctx2[27] + ""))
          set_data(t, t_value);
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_else_block_1(ctx) {
    let div2;
    let div0;
    let h40;
    let t1;
    let p0;
    let t3;
    let each_blocks_1 = [];
    let each0_lookup = /* @__PURE__ */ new Map();
    let t4;
    let div1;
    let h41;
    let t6;
    let p1;
    let t8;
    let each_blocks = [];
    let each1_lookup = /* @__PURE__ */ new Map();
    let each_value_1 = ensure_array_like(
      /*nonAdminUsers*/
      ctx[8]
    );
    const get_key = (ctx2) => (
      /*user*/
      ctx2[22].username
    );
    for (let i = 0; i < each_value_1.length; i += 1) {
      let child_ctx = get_each_context_12(ctx, each_value_1, i);
      let key = get_key(child_ctx);
      each0_lookup.set(key, each_blocks_1[i] = create_each_block_12(key, child_ctx));
    }
    let each_value = ensure_array_like(
      /*nonAdminUsers*/
      ctx[8]
    );
    const get_key_1 = (ctx2) => (
      /*user*/
      ctx2[22].username
    );
    for (let i = 0; i < each_value.length; i += 1) {
      let child_ctx = get_each_context4(ctx, each_value, i);
      let key = get_key_1(child_ctx);
      each1_lookup.set(key, each_blocks[i] = create_each_block4(key, child_ctx));
    }
    return {
      c() {
        div2 = element("div");
        div0 = element("div");
        h40 = element("h4");
        h40.textContent = "Editors";
        t1 = space();
        p0 = element("p");
        p0.textContent = "Can read and write";
        t3 = space();
        for (let i = 0; i < each_blocks_1.length; i += 1) {
          each_blocks_1[i].c();
        }
        t4 = space();
        div1 = element("div");
        h41 = element("h4");
        h41.textContent = "Readers";
        t6 = space();
        p1 = element("p");
        p1.textContent = "Can only read";
        t8 = space();
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        attr(h40, "class", "svelte-1aq9pf1");
        attr(p0, "class", "col-desc svelte-1aq9pf1");
        attr(div0, "class", "perm-col svelte-1aq9pf1");
        attr(h41, "class", "svelte-1aq9pf1");
        attr(p1, "class", "col-desc svelte-1aq9pf1");
        attr(div1, "class", "perm-col svelte-1aq9pf1");
        attr(div2, "class", "perm-grid svelte-1aq9pf1");
      },
      m(target, anchor) {
        insert(target, div2, anchor);
        append(div2, div0);
        append(div0, h40);
        append(div0, t1);
        append(div0, p0);
        append(div0, t3);
        for (let i = 0; i < each_blocks_1.length; i += 1) {
          if (each_blocks_1[i]) {
            each_blocks_1[i].m(div0, null);
          }
        }
        append(div2, t4);
        append(div2, div1);
        append(div1, h41);
        append(div1, t6);
        append(div1, p1);
        append(div1, t8);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(div1, null);
          }
        }
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*nonAdminUsers, editEditors, toggleEditor*/
        2320) {
          each_value_1 = ensure_array_like(
            /*nonAdminUsers*/
            ctx2[8]
          );
          each_blocks_1 = update_keyed_each(each_blocks_1, dirty, get_key, 1, ctx2, each_value_1, each0_lookup, div0, destroy_block, create_each_block_12, null, get_each_context_12);
        }
        if (dirty[0] & /*nonAdminUsers, editReaders, toggleReader*/
        4384) {
          each_value = ensure_array_like(
            /*nonAdminUsers*/
            ctx2[8]
          );
          each_blocks = update_keyed_each(each_blocks, dirty, get_key_1, 1, ctx2, each_value, each1_lookup, div1, destroy_block, create_each_block4, null, get_each_context4);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(div2);
        }
        for (let i = 0; i < each_blocks_1.length; i += 1) {
          each_blocks_1[i].d();
        }
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].d();
        }
      }
    };
  }
  function create_if_block_23(ctx) {
    let div;
    return {
      c() {
        div = element("div");
        div.textContent = "No non-admin users to assign";
        attr(div, "class", "empty svelte-1aq9pf1");
      },
      m(target, anchor) {
        insert(target, div, anchor);
      },
      p: noop,
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_each_block_12(key_1, ctx) {
    let label;
    let input;
    let input_checked_value;
    let t0;
    let span0;
    let t2;
    let span1;
    let t4;
    let mounted;
    let dispose;
    function change_handler() {
      return (
        /*change_handler*/
        ctx[20](
          /*user*/
          ctx[22]
        )
      );
    }
    return {
      key: key_1,
      first: null,
      c() {
        label = element("label");
        input = element("input");
        t0 = space();
        span0 = element("span");
        span0.textContent = `${/*user*/
        ctx[22].username}`;
        t2 = space();
        span1 = element("span");
        span1.textContent = `${/*user*/
        ctx[22].role}`;
        t4 = space();
        attr(input, "type", "checkbox");
        input.checked = input_checked_value = /*editEditors*/
        ctx[4].includes(
          /*user*/
          ctx[22].username
        );
        attr(input, "class", "svelte-1aq9pf1");
        attr(span1, "class", "user-role svelte-1aq9pf1");
        attr(label, "class", "perm-check svelte-1aq9pf1");
        this.first = label;
      },
      m(target, anchor) {
        insert(target, label, anchor);
        append(label, input);
        append(label, t0);
        append(label, span0);
        append(label, t2);
        append(label, span1);
        append(label, t4);
        if (!mounted) {
          dispose = listen(input, "change", change_handler);
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (dirty[0] & /*editEditors*/
        16 && input_checked_value !== (input_checked_value = /*editEditors*/
        ctx[4].includes(
          /*user*/
          ctx[22].username
        ))) {
          input.checked = input_checked_value;
        }
      },
      d(detaching) {
        if (detaching) {
          detach(label);
        }
        mounted = false;
        dispose();
      }
    };
  }
  function create_each_block4(key_1, ctx) {
    let label;
    let input;
    let input_checked_value;
    let t0;
    let span0;
    let t2;
    let span1;
    let t4;
    let mounted;
    let dispose;
    function change_handler_1() {
      return (
        /*change_handler_1*/
        ctx[21](
          /*user*/
          ctx[22]
        )
      );
    }
    return {
      key: key_1,
      first: null,
      c() {
        label = element("label");
        input = element("input");
        t0 = space();
        span0 = element("span");
        span0.textContent = `${/*user*/
        ctx[22].username}`;
        t2 = space();
        span1 = element("span");
        span1.textContent = `${/*user*/
        ctx[22].role}`;
        t4 = space();
        attr(input, "type", "checkbox");
        input.checked = input_checked_value = /*editReaders*/
        ctx[5].includes(
          /*user*/
          ctx[22].username
        );
        attr(input, "class", "svelte-1aq9pf1");
        attr(span1, "class", "user-role svelte-1aq9pf1");
        attr(label, "class", "perm-check svelte-1aq9pf1");
        this.first = label;
      },
      m(target, anchor) {
        insert(target, label, anchor);
        append(label, input);
        append(label, t0);
        append(label, span0);
        append(label, t2);
        append(label, span1);
        append(label, t4);
        if (!mounted) {
          dispose = listen(input, "change", change_handler_1);
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (dirty[0] & /*editReaders*/
        32 && input_checked_value !== (input_checked_value = /*editReaders*/
        ctx[5].includes(
          /*user*/
          ctx[22].username
        ))) {
          input.checked = input_checked_value;
        }
      },
      d(detaching) {
        if (detaching) {
          detach(label);
        }
        mounted = false;
        dispose();
      }
    };
  }
  function create_default_slot_24(ctx) {
    let t;
    return {
      c() {
        t = text("Clear All");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_default_slot_15(ctx) {
    let t;
    return {
      c() {
        t = text("Cancel");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_icon_slot_14(ctx) {
    let x3;
    let current;
    x3 = new x_default({ props: { size: "0.875rem" } });
    return {
      c() {
        create_component(x3.$$.fragment);
      },
      m(target, anchor) {
        mount_component(x3, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(x3.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(x3.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(x3, detaching);
      }
    };
  }
  function create_default_slot31(ctx) {
    let t;
    return {
      c() {
        t = text("Save");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_icon_slot5(ctx) {
    let check;
    let current;
    check = new check_default({ props: { size: "0.875rem" } });
    return {
      c() {
        create_component(check.$$.fragment);
      },
      m(target, anchor) {
        mount_component(check, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(check.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(check.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(check, detaching);
      }
    };
  }
  function create_fragment38(ctx) {
    let div2;
    let div0;
    let h3;
    let t1;
    let t2;
    let div1;
    let current_block_type_index;
    let if_block1;
    let current;
    function select_block_type(ctx2, dirty) {
      if (
        /*vaults*/
        ctx2[0].length === 0
      )
        return create_if_block_8;
      return create_else_block_5;
    }
    let current_block_type = select_block_type(ctx, [-1, -1]);
    let if_block0 = current_block_type(ctx);
    const if_block_creators = [create_if_block8, create_else_block3];
    const if_blocks = [];
    function select_block_type_1(ctx2, dirty) {
      if (!/*selectedVault*/
      ctx2[2])
        return 0;
      return 1;
    }
    current_block_type_index = select_block_type_1(ctx, [-1, -1]);
    if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    return {
      c() {
        div2 = element("div");
        div0 = element("div");
        h3 = element("h3");
        h3.textContent = "Vaults";
        t1 = space();
        if_block0.c();
        t2 = space();
        div1 = element("div");
        if_block1.c();
        attr(h3, "class", "svelte-1aq9pf1");
        attr(div0, "class", "vault-list svelte-1aq9pf1");
        attr(div1, "class", "perm-detail svelte-1aq9pf1");
        attr(div2, "class", "perm-layout svelte-1aq9pf1");
      },
      m(target, anchor) {
        insert(target, div2, anchor);
        append(div2, div0);
        append(div0, h3);
        append(div0, t1);
        if_block0.m(div0, null);
        append(div2, t2);
        append(div2, div1);
        if_blocks[current_block_type_index].m(div1, null);
        current = true;
      },
      p(ctx2, dirty) {
        if (current_block_type === (current_block_type = select_block_type(ctx2, dirty)) && if_block0) {
          if_block0.p(ctx2, dirty);
        } else {
          if_block0.d(1);
          if_block0 = current_block_type(ctx2);
          if (if_block0) {
            if_block0.c();
            if_block0.m(div0, null);
          }
        }
        let previous_block_index = current_block_type_index;
        current_block_type_index = select_block_type_1(ctx2, dirty);
        if (current_block_type_index === previous_block_index) {
          if_blocks[current_block_type_index].p(ctx2, dirty);
        } else {
          group_outros();
          transition_out(if_blocks[previous_block_index], 1, 1, () => {
            if_blocks[previous_block_index] = null;
          });
          check_outros();
          if_block1 = if_blocks[current_block_type_index];
          if (!if_block1) {
            if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx2);
            if_block1.c();
          } else {
            if_block1.p(ctx2, dirty);
          }
          transition_in(if_block1, 1);
          if_block1.m(div1, null);
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(if_block1);
        current = true;
      },
      o(local) {
        transition_out(if_block1);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div2);
        }
        if_block0.d();
        if_blocks[current_block_type_index].d();
      }
    };
  }
  function instance38($$self, $$props, $$invalidate) {
    let { vaults = [] } = $$props;
    let { permissions = {} } = $$props;
    let { users = [] } = $$props;
    let { refresh = () => {
    } } = $$props;
    let selectedVault = null;
    let editing = false;
    let editEditors = [];
    let editReaders = [];
    let editError = "";
    let saved = false;
    const nonAdminUsers = users.filter((u) => u.role !== "admin");
    function selectVault(vault) {
      $$invalidate(2, selectedVault = vault);
      $$invalidate(3, editing = false);
      $$invalidate(6, editError = "");
      $$invalidate(7, saved = false);
    }
    function startEdit() {
      const perm = permissions[selectedVault.id];
      $$invalidate(4, editEditors = (perm == null ? void 0 : perm.editors) ? [...perm.editors] : []);
      $$invalidate(5, editReaders = (perm == null ? void 0 : perm.readers) ? [...perm.readers] : []);
      $$invalidate(3, editing = true);
      $$invalidate(6, editError = "");
      $$invalidate(7, saved = false);
    }
    function toggleEditor(username) {
      if (editEditors.includes(username)) {
        $$invalidate(4, editEditors = editEditors.filter((u) => u !== username));
      } else {
        $$invalidate(4, editEditors = [...editEditors, username]);
        $$invalidate(5, editReaders = editReaders.filter((u) => u !== username));
      }
    }
    function toggleReader(username) {
      if (editReaders.includes(username)) {
        $$invalidate(5, editReaders = editReaders.filter((u) => u !== username));
      } else {
        $$invalidate(5, editReaders = [...editReaders, username]);
        $$invalidate(4, editEditors = editEditors.filter((u) => u !== username));
      }
    }
    async function savePermissions() {
      $$invalidate(6, editError = "");
      try {
        const res = await fetch(`/api/admin/permissions/${encodeURIComponent(selectedVault.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            editors: editEditors,
            readers: editReaders
          })
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed");
        }
        $$invalidate(3, editing = false);
        $$invalidate(7, saved = true);
        refresh();
      } catch (e) {
        $$invalidate(6, editError = e.message);
      }
    }
    function cancelEdit() {
      $$invalidate(3, editing = false);
      $$invalidate(6, editError = "");
    }
    function clearPermissions() {
      $$invalidate(4, editEditors = []);
      $$invalidate(5, editReaders = []);
    }
    function hasPermission(vaultId) {
      var _a, _b;
      const perm = permissions[vaultId];
      return perm && (((_a = perm.editors) == null ? void 0 : _a.length) > 0 || ((_b = perm.readers) == null ? void 0 : _b.length) > 0);
    }
    const click_handler = (vault) => selectVault(vault);
    const change_handler = (user) => toggleEditor(user.username);
    const change_handler_1 = (user) => toggleReader(user.username);
    $$self.$$set = ($$props2) => {
      if ("vaults" in $$props2)
        $$invalidate(0, vaults = $$props2.vaults);
      if ("permissions" in $$props2)
        $$invalidate(1, permissions = $$props2.permissions);
      if ("users" in $$props2)
        $$invalidate(17, users = $$props2.users);
      if ("refresh" in $$props2)
        $$invalidate(18, refresh = $$props2.refresh);
    };
    return [
      vaults,
      permissions,
      selectedVault,
      editing,
      editEditors,
      editReaders,
      editError,
      saved,
      nonAdminUsers,
      selectVault,
      startEdit,
      toggleEditor,
      toggleReader,
      savePermissions,
      cancelEdit,
      clearPermissions,
      hasPermission,
      users,
      refresh,
      click_handler,
      change_handler,
      change_handler_1
    ];
  }
  var VaultPermissions = class extends SvelteComponent {
    constructor(options) {
      super();
      init(
        this,
        options,
        instance38,
        create_fragment38,
        safe_not_equal,
        {
          vaults: 0,
          permissions: 1,
          users: 17,
          refresh: 18
        },
        add_css12,
        [-1, -1]
      );
    }
  };
  var VaultPermissions_default = VaultPermissions;

  // packages/ui/src/views/admin/RoleList.svelte
  function add_css13(target) {
    append_styles(target, "svelte-qkkerm", ".role-list.svelte-qkkerm.svelte-qkkerm{display:flex;flex-direction:column;gap:0.75rem}.list-header.svelte-qkkerm.svelte-qkkerm{display:flex;justify-content:space-between;align-items:center}.list-header.svelte-qkkerm h3.svelte-qkkerm{margin:0;font-size:1rem;color:var(--text-normal)}.create-form.svelte-qkkerm.svelte-qkkerm{display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;padding:0.75rem;background:var(--background-primary-alt);border-radius:8px}.create-form.svelte-qkkerm input.svelte-qkkerm{padding:6px 10px;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:6px;color:var(--text-normal);font-size:0.8125rem;outline:none;width:150px}.form-actions.svelte-qkkerm.svelte-qkkerm{display:flex;gap:0.25rem}.form-error.svelte-qkkerm.svelte-qkkerm{width:100%;color:var(--text-error);font-size:0.75rem}.role-grid.svelte-qkkerm.svelte-qkkerm{display:flex;flex-direction:column;gap:0.5rem}.role-card.svelte-qkkerm.svelte-qkkerm{background:var(--background-primary-alt);border:1px solid var(--background-modifier-border);border-radius:8px;padding:0.75rem;display:flex;flex-direction:column;gap:0.5rem}.role-card.builtin.svelte-qkkerm.svelte-qkkerm{border-style:dashed;opacity:0.85}.role-header.svelte-qkkerm.svelte-qkkerm{display:flex;justify-content:space-between;align-items:center}.role-name.svelte-qkkerm.svelte-qkkerm{display:flex;align-items:center;gap:0.4rem;font-weight:600;font-size:0.875rem}.role-id.svelte-qkkerm.svelte-qkkerm{font-weight:400;font-size:0.75rem;color:var(--text-muted)}.role-tags.svelte-qkkerm.svelte-qkkerm{display:flex;gap:0.375rem;align-items:center}.perm-count.svelte-qkkerm.svelte-qkkerm{font-size:0.6875rem;color:var(--text-muted);background:var(--background-modifier-hover);padding:1px 6px;border-radius:4px}.fa-badge.svelte-qkkerm.svelte-qkkerm{display:flex;align-items:center;gap:2px;font-size:0.625rem;font-weight:600;text-transform:uppercase;background:rgba(59, 130, 246, 0.15);color:#93c5fd;padding:1px 5px;border-radius:4px}.fa-badge.ro.svelte-qkkerm.svelte-qkkerm{background:rgba(234, 179, 8, 0.15);color:#fcd34d}.role-perms.svelte-qkkerm.svelte-qkkerm{display:flex;flex-wrap:wrap;gap:0.25rem}.perm-item.svelte-qkkerm.svelte-qkkerm{display:flex;align-items:center;gap:3px;padding:2px 6px;border-radius:4px;font-size:0.6875rem;background:rgba(76, 175, 80, 0.15);color:#86efac}.perm-item.inherited.svelte-qkkerm.svelte-qkkerm{background:rgba(168, 85, 247, 0.12);color:#c4b5fd}.role-footer.svelte-qkkerm.svelte-qkkerm{display:flex;flex-direction:column;gap:0.25rem}.fa-summary.svelte-qkkerm.svelte-qkkerm{display:flex;align-items:center;gap:4px;font-size:0.6875rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.role-actions.svelte-qkkerm.svelte-qkkerm{display:flex;gap:0.25rem;justify-content:flex-end;margin-top:0.25rem}.empty.svelte-qkkerm.svelte-qkkerm{text-align:center;color:var(--text-muted);font-size:0.8125rem;padding:2rem}");
  }
  function get_each_context5(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[17] = list[i];
    return child_ctx;
  }
  function get_each_context_13(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[20] = list[i];
    return child_ctx;
  }
  function create_default_slot_25(ctx) {
    let t;
    return {
      c() {
        t = text("New Role");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_icon_slot_32(ctx) {
    let plus;
    let current;
    plus = new plus_default({ props: { size: "0.875rem" } });
    return {
      c() {
        create_component(plus.$$.fragment);
      },
      m(target, anchor) {
        mount_component(plus, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(plus.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(plus.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(plus, detaching);
      }
    };
  }
  function create_if_block_92(ctx) {
    let div1;
    let input0;
    let t0;
    let input1;
    let t1;
    let div0;
    let button0;
    let t2;
    let button1;
    let t3;
    let current;
    let mounted;
    let dispose;
    button0 = new Button_default({
      props: {
        variant: "ghost",
        size: "small",
        $$slots: { icon: [create_icon_slot_22] },
        $$scope: { ctx }
      }
    });
    button0.$on(
      "click",
      /*click_handler_1*/
      ctx[13]
    );
    button1 = new Button_default({
      props: {
        variant: "primary",
        size: "small",
        $$slots: {
          icon: [create_icon_slot_15],
          default: [create_default_slot_16]
        },
        $$scope: { ctx }
      }
    });
    button1.$on(
      "click",
      /*handleCreate*/
      ctx[6]
    );
    let if_block = (
      /*createError*/
      ctx[5] && create_if_block_10(ctx)
    );
    return {
      c() {
        div1 = element("div");
        input0 = element("input");
        t0 = space();
        input1 = element("input");
        t1 = space();
        div0 = element("div");
        create_component(button0.$$.fragment);
        t2 = space();
        create_component(button1.$$.fragment);
        t3 = space();
        if (if_block)
          if_block.c();
        attr(input0, "type", "text");
        attr(input0, "placeholder", "Role ID (alphanumeric)");
        attr(input0, "class", "svelte-qkkerm");
        attr(input1, "type", "text");
        attr(input1, "placeholder", "Display name");
        attr(input1, "class", "svelte-qkkerm");
        attr(div0, "class", "form-actions svelte-qkkerm");
        attr(div1, "class", "create-form svelte-qkkerm");
      },
      m(target, anchor) {
        insert(target, div1, anchor);
        append(div1, input0);
        set_input_value(
          input0,
          /*createName*/
          ctx[3]
        );
        append(div1, t0);
        append(div1, input1);
        set_input_value(
          input1,
          /*createDisplayName*/
          ctx[4]
        );
        append(div1, t1);
        append(div1, div0);
        mount_component(button0, div0, null);
        append(div0, t2);
        mount_component(button1, div0, null);
        append(div1, t3);
        if (if_block)
          if_block.m(div1, null);
        current = true;
        if (!mounted) {
          dispose = [
            listen(
              input0,
              "input",
              /*input0_input_handler*/
              ctx[11]
            ),
            listen(
              input1,
              "input",
              /*input1_input_handler*/
              ctx[12]
            )
          ];
          mounted = true;
        }
      },
      p(ctx2, dirty) {
        if (dirty & /*createName*/
        8 && input0.value !== /*createName*/
        ctx2[3]) {
          set_input_value(
            input0,
            /*createName*/
            ctx2[3]
          );
        }
        if (dirty & /*createDisplayName*/
        16 && input1.value !== /*createDisplayName*/
        ctx2[4]) {
          set_input_value(
            input1,
            /*createDisplayName*/
            ctx2[4]
          );
        }
        const button0_changes = {};
        if (dirty & /*$$scope*/
        8388608) {
          button0_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button0.$set(button0_changes);
        const button1_changes = {};
        if (dirty & /*$$scope*/
        8388608) {
          button1_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button1.$set(button1_changes);
        if (
          /*createError*/
          ctx2[5]
        ) {
          if (if_block) {
            if_block.p(ctx2, dirty);
          } else {
            if_block = create_if_block_10(ctx2);
            if_block.c();
            if_block.m(div1, null);
          }
        } else if (if_block) {
          if_block.d(1);
          if_block = null;
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(button0.$$.fragment, local);
        transition_in(button1.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(button0.$$.fragment, local);
        transition_out(button1.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div1);
        }
        destroy_component(button0);
        destroy_component(button1);
        if (if_block)
          if_block.d();
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function create_icon_slot_22(ctx) {
    let x3;
    let current;
    x3 = new x_default({ props: { size: "0.875rem" } });
    return {
      c() {
        create_component(x3.$$.fragment);
      },
      m(target, anchor) {
        mount_component(x3, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(x3.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(x3.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(x3, detaching);
      }
    };
  }
  function create_default_slot_16(ctx) {
    let t;
    return {
      c() {
        t = text("Create");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_icon_slot_15(ctx) {
    let check;
    let current;
    check = new check_default({ props: { size: "0.875rem" } });
    return {
      c() {
        create_component(check.$$.fragment);
      },
      m(target, anchor) {
        mount_component(check, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(check.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(check.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(check, detaching);
      }
    };
  }
  function create_if_block_10(ctx) {
    let div;
    let t;
    return {
      c() {
        div = element("div");
        t = text(
          /*createError*/
          ctx[5]
        );
        attr(div, "class", "form-error svelte-qkkerm");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, t);
      },
      p(ctx2, dirty) {
        if (dirty & /*createError*/
        32)
          set_data(
            t,
            /*createError*/
            ctx2[5]
          );
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_if_block_82(ctx) {
    let span;
    let folderkey;
    let t0;
    let t1_value = (
      /*role*/
      ctx[17].fileAccess.type + ""
    );
    let t1;
    let span_title_value;
    let current;
    folderkey = new folder_key_default({ props: { size: "0.75rem" } });
    return {
      c() {
        span = element("span");
        create_component(folderkey.$$.fragment);
        t0 = space();
        t1 = text(t1_value);
        attr(span, "class", "fa-badge svelte-qkkerm");
        attr(span, "title", span_title_value = "File access rules: " + /*role*/
        ctx[17].fileAccess.type);
      },
      m(target, anchor) {
        insert(target, span, anchor);
        mount_component(folderkey, span, null);
        append(span, t0);
        append(span, t1);
        current = true;
      },
      p(ctx2, dirty) {
        if ((!current || dirty & /*roles*/
        1) && t1_value !== (t1_value = /*role*/
        ctx2[17].fileAccess.type + ""))
          set_data(t1, t1_value);
        if (!current || dirty & /*roles*/
        1 && span_title_value !== (span_title_value = "File access rules: " + /*role*/
        ctx2[17].fileAccess.type)) {
          attr(span, "title", span_title_value);
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(folderkey.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(folderkey.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(span);
        }
        destroy_component(folderkey);
      }
    };
  }
  function create_if_block_72(ctx) {
    let span;
    return {
      c() {
        span = element("span");
        span.textContent = "RO";
        attr(span, "class", "fa-badge ro svelte-qkkerm");
        attr(span, "title", "Editors are read-only");
      },
      m(target, anchor) {
        insert(target, span, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(span);
        }
      }
    };
  }
  function create_if_block_62(ctx) {
    let span;
    let switch_instance;
    let t0;
    let t1_value = (
      /*perm*/
      ctx[20].label + ""
    );
    let t1;
    let t2;
    let current;
    var switch_value = (
      /*perm*/
      ctx[20].icon
    );
    function switch_props(ctx2, dirty) {
      return { props: { size: "0.75rem" } };
    }
    if (switch_value) {
      switch_instance = construct_svelte_component(switch_value, switch_props(ctx));
    }
    return {
      c() {
        span = element("span");
        if (switch_instance)
          create_component(switch_instance.$$.fragment);
        t0 = space();
        t1 = text(t1_value);
        t2 = space();
        attr(span, "class", "perm-item active svelte-qkkerm");
        toggle_class(
          span,
          "inherited",
          /*role*/
          ctx[17].permissions.includes("*") && /*perm*/
          ctx[20].id !== "*"
        );
      },
      m(target, anchor) {
        insert(target, span, anchor);
        if (switch_instance)
          mount_component(switch_instance, span, null);
        append(span, t0);
        append(span, t1);
        append(span, t2);
        current = true;
      },
      p(ctx2, dirty) {
        if (switch_value !== (switch_value = /*perm*/
        ctx2[20].icon)) {
          if (switch_instance) {
            group_outros();
            const old_component = switch_instance;
            transition_out(old_component.$$.fragment, 1, 0, () => {
              destroy_component(old_component, 1);
            });
            check_outros();
          }
          if (switch_value) {
            switch_instance = construct_svelte_component(switch_value, switch_props(ctx2, dirty));
            create_component(switch_instance.$$.fragment);
            transition_in(switch_instance.$$.fragment, 1);
            mount_component(switch_instance, span, t0);
          } else {
            switch_instance = null;
          }
        } else if (switch_value) {
        }
        if (!current || dirty & /*roles, ALL_PERMISSIONS*/
        257) {
          toggle_class(
            span,
            "inherited",
            /*role*/
            ctx2[17].permissions.includes("*") && /*perm*/
            ctx2[20].id !== "*"
          );
        }
      },
      i(local) {
        if (current)
          return;
        if (switch_instance)
          transition_in(switch_instance.$$.fragment, local);
        current = true;
      },
      o(local) {
        if (switch_instance)
          transition_out(switch_instance.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(span);
        }
        if (switch_instance)
          destroy_component(switch_instance);
      }
    };
  }
  function create_each_block_13(ctx) {
    let show_if = (
      /*role*/
      ctx[17].permissions.includes("*") || /*role*/
      ctx[17].permissions.includes(
        /*perm*/
        ctx[20].id
      )
    );
    let if_block_anchor;
    let current;
    let if_block = show_if && create_if_block_62(ctx);
    return {
      c() {
        if (if_block)
          if_block.c();
        if_block_anchor = empty();
      },
      m(target, anchor) {
        if (if_block)
          if_block.m(target, anchor);
        insert(target, if_block_anchor, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        if (dirty & /*roles*/
        1)
          show_if = /*role*/
          ctx2[17].permissions.includes("*") || /*role*/
          ctx2[17].permissions.includes(
            /*perm*/
            ctx2[20].id
          );
        if (show_if) {
          if (if_block) {
            if_block.p(ctx2, dirty);
            if (dirty & /*roles*/
            1) {
              transition_in(if_block, 1);
            }
          } else {
            if_block = create_if_block_62(ctx2);
            if_block.c();
            transition_in(if_block, 1);
            if_block.m(if_block_anchor.parentNode, if_block_anchor);
          }
        } else if (if_block) {
          group_outros();
          transition_out(if_block, 1, 1, () => {
            if_block = null;
          });
          check_outros();
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(if_block);
        current = true;
      },
      o(local) {
        transition_out(if_block);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(if_block_anchor);
        }
        if (if_block)
          if_block.d(detaching);
      }
    };
  }
  function create_if_block_42(ctx) {
    var _a;
    let div;
    let folderkey;
    let t0;
    let t1_value = (
      /*role*/
      ctx[17].fileAccess.type === "whitelist" ? "Only: " : "Blocked: "
    );
    let t1;
    let t2;
    let t3_value = (
      /*role*/
      ((ctx[17].fileAccess.paths || []).join(", ") || "none") + ""
    );
    let t3;
    let t4;
    let current;
    folderkey = new folder_key_default({ props: { size: "0.75rem" } });
    let if_block = (
      /*role*/
      ((_a = ctx[17].fileAccess.tags) == null ? void 0 : _a.length) && create_if_block_52(ctx)
    );
    return {
      c() {
        div = element("div");
        create_component(folderkey.$$.fragment);
        t0 = space();
        t1 = text(t1_value);
        t2 = space();
        t3 = text(t3_value);
        t4 = space();
        if (if_block)
          if_block.c();
        attr(div, "class", "fa-summary svelte-qkkerm");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        mount_component(folderkey, div, null);
        append(div, t0);
        append(div, t1);
        append(div, t2);
        append(div, t3);
        append(div, t4);
        if (if_block)
          if_block.m(div, null);
        current = true;
      },
      p(ctx2, dirty) {
        var _a2;
        if ((!current || dirty & /*roles*/
        1) && t1_value !== (t1_value = /*role*/
        ctx2[17].fileAccess.type === "whitelist" ? "Only: " : "Blocked: "))
          set_data(t1, t1_value);
        if ((!current || dirty & /*roles*/
        1) && t3_value !== (t3_value = /*role*/
        ((ctx2[17].fileAccess.paths || []).join(", ") || "none") + ""))
          set_data(t3, t3_value);
        if (
          /*role*/
          (_a2 = ctx2[17].fileAccess.tags) == null ? void 0 : _a2.length
        ) {
          if (if_block) {
            if_block.p(ctx2, dirty);
          } else {
            if_block = create_if_block_52(ctx2);
            if_block.c();
            if_block.m(div, null);
          }
        } else if (if_block) {
          if_block.d(1);
          if_block = null;
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(folderkey.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(folderkey.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        destroy_component(folderkey);
        if (if_block)
          if_block.d();
      }
    };
  }
  function create_if_block_52(ctx) {
    let t0;
    let t1_value = (
      /*role*/
      (ctx[17].fileAccess.tags || []).join(", ") + ""
    );
    let t1;
    return {
      c() {
        t0 = text("| Tags: ");
        t1 = text(t1_value);
      },
      m(target, anchor) {
        insert(target, t0, anchor);
        insert(target, t1, anchor);
      },
      p(ctx2, dirty) {
        if (dirty & /*roles*/
        1 && t1_value !== (t1_value = /*role*/
        (ctx2[17].fileAccess.tags || []).join(", ") + ""))
          set_data(t1, t1_value);
      },
      d(detaching) {
        if (detaching) {
          detach(t0);
          detach(t1);
        }
      }
    };
  }
  function create_if_block_34(ctx) {
    let div;
    let ribbon;
    let t0;
    let t1_value = (
      /*role*/
      ctx[17].ribbonHiddenPluginIds.join(", ") + ""
    );
    let t1;
    let current;
    ribbon = new ribbon_default({ props: { size: "0.75rem" } });
    return {
      c() {
        div = element("div");
        create_component(ribbon.$$.fragment);
        t0 = text("\n              Hidden ribbon: ");
        t1 = text(t1_value);
        attr(div, "class", "fa-summary svelte-qkkerm");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        mount_component(ribbon, div, null);
        append(div, t0);
        append(div, t1);
        current = true;
      },
      p(ctx2, dirty) {
        if ((!current || dirty & /*roles*/
        1) && t1_value !== (t1_value = /*role*/
        ctx2[17].ribbonHiddenPluginIds.join(", ") + ""))
          set_data(t1, t1_value);
      },
      i(local) {
        if (current)
          return;
        transition_in(ribbon.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(ribbon.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        destroy_component(ribbon);
      }
    };
  }
  function create_if_block_24(ctx) {
    let div;
    let menusquare;
    let t0;
    let t1_value = (
      /*role*/
      ctx[17].hideMenuItems.join(", ") + ""
    );
    let t1;
    let current;
    menusquare = new square_menu_default({ props: { size: "0.75rem" } });
    return {
      c() {
        div = element("div");
        create_component(menusquare.$$.fragment);
        t0 = text("\n              Hidden menu: ");
        t1 = text(t1_value);
        attr(div, "class", "fa-summary svelte-qkkerm");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        mount_component(menusquare, div, null);
        append(div, t0);
        append(div, t1);
        current = true;
      },
      p(ctx2, dirty) {
        if ((!current || dirty & /*roles*/
        1) && t1_value !== (t1_value = /*role*/
        ctx2[17].hideMenuItems.join(", ") + ""))
          set_data(t1, t1_value);
      },
      i(local) {
        if (current)
          return;
        transition_in(menusquare.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(menusquare.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        destroy_component(menusquare);
      }
    };
  }
  function create_default_slot32(ctx) {
    let t;
    return {
      c() {
        t = text("Edit");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_if_block_15(ctx) {
    let button;
    let current;
    function click_handler_3() {
      return (
        /*click_handler_3*/
        ctx[15](
          /*role*/
          ctx[17]
        )
      );
    }
    button = new Button_default({
      props: {
        variant: "ghost-danger",
        size: "small",
        $$slots: { icon: [create_icon_slot6] },
        $$scope: { ctx }
      }
    });
    button.$on("click", click_handler_3);
    return {
      c() {
        create_component(button.$$.fragment);
      },
      m(target, anchor) {
        mount_component(button, target, anchor);
        current = true;
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        const button_changes = {};
        if (dirty & /*$$scope*/
        8388608) {
          button_changes.$$scope = { dirty, ctx };
        }
        button.$set(button_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(button.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(button.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(button, detaching);
      }
    };
  }
  function create_icon_slot6(ctx) {
    let trash2;
    let current;
    trash2 = new trash_2_default({ props: { size: "0.75rem" } });
    return {
      c() {
        create_component(trash2.$$.fragment);
      },
      m(target, anchor) {
        mount_component(trash2, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(trash2.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(trash2.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(trash2, detaching);
      }
    };
  }
  function create_each_block5(key_1, ctx) {
    var _a, _b;
    let div6;
    let div2;
    let div0;
    let shield;
    let t0;
    let span0;
    let t1_value = (
      /*role*/
      ctx[17].displayName + ""
    );
    let t1;
    let t2;
    let span1;
    let t3;
    let t4_value = (
      /*role*/
      ctx[17].name + ""
    );
    let t4;
    let t5;
    let t6;
    let div1;
    let span2;
    let t7_value = (
      /*role*/
      ctx[17].permissions.length + ""
    );
    let t7;
    let t8;
    let t9;
    let t10;
    let t11;
    let div3;
    let t12;
    let div5;
    let t13;
    let t14;
    let t15;
    let div4;
    let button;
    let t16;
    let t17;
    let current;
    shield = new shield_default({ props: { size: "1rem" } });
    let if_block0 = (
      /*role*/
      ctx[17].fileAccess && create_if_block_82(ctx)
    );
    let if_block1 = (
      /*role*/
      ctx[17].makeEditorsReadOnly && create_if_block_72(ctx)
    );
    let each_value_1 = ensure_array_like(
      /*ALL_PERMISSIONS*/
      ctx[8]
    );
    let each_blocks = [];
    for (let i = 0; i < each_value_1.length; i += 1) {
      each_blocks[i] = create_each_block_13(get_each_context_13(ctx, each_value_1, i));
    }
    const out = (i) => transition_out(each_blocks[i], 1, 1, () => {
      each_blocks[i] = null;
    });
    let if_block2 = (
      /*role*/
      ctx[17].fileAccess && create_if_block_42(ctx)
    );
    let if_block3 = (
      /*role*/
      ((_a = ctx[17].ribbonHiddenPluginIds) == null ? void 0 : _a.length) && create_if_block_34(ctx)
    );
    let if_block4 = (
      /*role*/
      ((_b = ctx[17].hideMenuItems) == null ? void 0 : _b.length) && create_if_block_24(ctx)
    );
    function click_handler_2() {
      return (
        /*click_handler_2*/
        ctx[14](
          /*role*/
          ctx[17]
        )
      );
    }
    button = new Button_default({
      props: {
        variant: "ghost",
        size: "small",
        $$slots: { default: [create_default_slot32] },
        $$scope: { ctx }
      }
    });
    button.$on("click", click_handler_2);
    let if_block5 = !/*role*/
    ctx[17].builtin && create_if_block_15(ctx);
    return {
      key: key_1,
      first: null,
      c() {
        div6 = element("div");
        div2 = element("div");
        div0 = element("div");
        create_component(shield.$$.fragment);
        t0 = space();
        span0 = element("span");
        t1 = text(t1_value);
        t2 = space();
        span1 = element("span");
        t3 = text("(");
        t4 = text(t4_value);
        t5 = text(")");
        t6 = space();
        div1 = element("div");
        span2 = element("span");
        t7 = text(t7_value);
        t8 = text(" perms");
        t9 = space();
        if (if_block0)
          if_block0.c();
        t10 = space();
        if (if_block1)
          if_block1.c();
        t11 = space();
        div3 = element("div");
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        t12 = space();
        div5 = element("div");
        if (if_block2)
          if_block2.c();
        t13 = space();
        if (if_block3)
          if_block3.c();
        t14 = space();
        if (if_block4)
          if_block4.c();
        t15 = space();
        div4 = element("div");
        create_component(button.$$.fragment);
        t16 = space();
        if (if_block5)
          if_block5.c();
        t17 = space();
        attr(span1, "class", "role-id svelte-qkkerm");
        attr(div0, "class", "role-name svelte-qkkerm");
        attr(span2, "class", "perm-count svelte-qkkerm");
        attr(div1, "class", "role-tags svelte-qkkerm");
        attr(div2, "class", "role-header svelte-qkkerm");
        attr(div3, "class", "role-perms svelte-qkkerm");
        attr(div4, "class", "role-actions svelte-qkkerm");
        attr(div5, "class", "role-footer svelte-qkkerm");
        attr(div6, "class", "role-card svelte-qkkerm");
        toggle_class(
          div6,
          "builtin",
          /*role*/
          ctx[17].builtin
        );
        this.first = div6;
      },
      m(target, anchor) {
        insert(target, div6, anchor);
        append(div6, div2);
        append(div2, div0);
        mount_component(shield, div0, null);
        append(div0, t0);
        append(div0, span0);
        append(span0, t1);
        append(div0, t2);
        append(div0, span1);
        append(span1, t3);
        append(span1, t4);
        append(span1, t5);
        append(div2, t6);
        append(div2, div1);
        append(div1, span2);
        append(span2, t7);
        append(span2, t8);
        append(div1, t9);
        if (if_block0)
          if_block0.m(div1, null);
        append(div1, t10);
        if (if_block1)
          if_block1.m(div1, null);
        append(div6, t11);
        append(div6, div3);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(div3, null);
          }
        }
        append(div6, t12);
        append(div6, div5);
        if (if_block2)
          if_block2.m(div5, null);
        append(div5, t13);
        if (if_block3)
          if_block3.m(div5, null);
        append(div5, t14);
        if (if_block4)
          if_block4.m(div5, null);
        append(div5, t15);
        append(div5, div4);
        mount_component(button, div4, null);
        append(div4, t16);
        if (if_block5)
          if_block5.m(div4, null);
        append(div6, t17);
        current = true;
      },
      p(new_ctx, dirty) {
        var _a2, _b2;
        ctx = new_ctx;
        if ((!current || dirty & /*roles*/
        1) && t1_value !== (t1_value = /*role*/
        ctx[17].displayName + ""))
          set_data(t1, t1_value);
        if ((!current || dirty & /*roles*/
        1) && t4_value !== (t4_value = /*role*/
        ctx[17].name + ""))
          set_data(t4, t4_value);
        if ((!current || dirty & /*roles*/
        1) && t7_value !== (t7_value = /*role*/
        ctx[17].permissions.length + ""))
          set_data(t7, t7_value);
        if (
          /*role*/
          ctx[17].fileAccess
        ) {
          if (if_block0) {
            if_block0.p(ctx, dirty);
            if (dirty & /*roles*/
            1) {
              transition_in(if_block0, 1);
            }
          } else {
            if_block0 = create_if_block_82(ctx);
            if_block0.c();
            transition_in(if_block0, 1);
            if_block0.m(div1, t10);
          }
        } else if (if_block0) {
          group_outros();
          transition_out(if_block0, 1, 1, () => {
            if_block0 = null;
          });
          check_outros();
        }
        if (
          /*role*/
          ctx[17].makeEditorsReadOnly
        ) {
          if (if_block1) {
          } else {
            if_block1 = create_if_block_72(ctx);
            if_block1.c();
            if_block1.m(div1, null);
          }
        } else if (if_block1) {
          if_block1.d(1);
          if_block1 = null;
        }
        if (dirty & /*roles, ALL_PERMISSIONS*/
        257) {
          each_value_1 = ensure_array_like(
            /*ALL_PERMISSIONS*/
            ctx[8]
          );
          let i;
          for (i = 0; i < each_value_1.length; i += 1) {
            const child_ctx = get_each_context_13(ctx, each_value_1, i);
            if (each_blocks[i]) {
              each_blocks[i].p(child_ctx, dirty);
              transition_in(each_blocks[i], 1);
            } else {
              each_blocks[i] = create_each_block_13(child_ctx);
              each_blocks[i].c();
              transition_in(each_blocks[i], 1);
              each_blocks[i].m(div3, null);
            }
          }
          group_outros();
          for (i = each_value_1.length; i < each_blocks.length; i += 1) {
            out(i);
          }
          check_outros();
        }
        if (
          /*role*/
          ctx[17].fileAccess
        ) {
          if (if_block2) {
            if_block2.p(ctx, dirty);
            if (dirty & /*roles*/
            1) {
              transition_in(if_block2, 1);
            }
          } else {
            if_block2 = create_if_block_42(ctx);
            if_block2.c();
            transition_in(if_block2, 1);
            if_block2.m(div5, t13);
          }
        } else if (if_block2) {
          group_outros();
          transition_out(if_block2, 1, 1, () => {
            if_block2 = null;
          });
          check_outros();
        }
        if (
          /*role*/
          (_a2 = ctx[17].ribbonHiddenPluginIds) == null ? void 0 : _a2.length
        ) {
          if (if_block3) {
            if_block3.p(ctx, dirty);
            if (dirty & /*roles*/
            1) {
              transition_in(if_block3, 1);
            }
          } else {
            if_block3 = create_if_block_34(ctx);
            if_block3.c();
            transition_in(if_block3, 1);
            if_block3.m(div5, t14);
          }
        } else if (if_block3) {
          group_outros();
          transition_out(if_block3, 1, 1, () => {
            if_block3 = null;
          });
          check_outros();
        }
        if (
          /*role*/
          (_b2 = ctx[17].hideMenuItems) == null ? void 0 : _b2.length
        ) {
          if (if_block4) {
            if_block4.p(ctx, dirty);
            if (dirty & /*roles*/
            1) {
              transition_in(if_block4, 1);
            }
          } else {
            if_block4 = create_if_block_24(ctx);
            if_block4.c();
            transition_in(if_block4, 1);
            if_block4.m(div5, t15);
          }
        } else if (if_block4) {
          group_outros();
          transition_out(if_block4, 1, 1, () => {
            if_block4 = null;
          });
          check_outros();
        }
        const button_changes = {};
        if (dirty & /*$$scope*/
        8388608) {
          button_changes.$$scope = { dirty, ctx };
        }
        button.$set(button_changes);
        if (!/*role*/
        ctx[17].builtin) {
          if (if_block5) {
            if_block5.p(ctx, dirty);
            if (dirty & /*roles*/
            1) {
              transition_in(if_block5, 1);
            }
          } else {
            if_block5 = create_if_block_15(ctx);
            if_block5.c();
            transition_in(if_block5, 1);
            if_block5.m(div4, null);
          }
        } else if (if_block5) {
          group_outros();
          transition_out(if_block5, 1, 1, () => {
            if_block5 = null;
          });
          check_outros();
        }
        if (!current || dirty & /*roles*/
        1) {
          toggle_class(
            div6,
            "builtin",
            /*role*/
            ctx[17].builtin
          );
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(shield.$$.fragment, local);
        transition_in(if_block0);
        for (let i = 0; i < each_value_1.length; i += 1) {
          transition_in(each_blocks[i]);
        }
        transition_in(if_block2);
        transition_in(if_block3);
        transition_in(if_block4);
        transition_in(button.$$.fragment, local);
        transition_in(if_block5);
        current = true;
      },
      o(local) {
        transition_out(shield.$$.fragment, local);
        transition_out(if_block0);
        each_blocks = each_blocks.filter(Boolean);
        for (let i = 0; i < each_blocks.length; i += 1) {
          transition_out(each_blocks[i]);
        }
        transition_out(if_block2);
        transition_out(if_block3);
        transition_out(if_block4);
        transition_out(button.$$.fragment, local);
        transition_out(if_block5);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div6);
        }
        destroy_component(shield);
        if (if_block0)
          if_block0.d();
        if (if_block1)
          if_block1.d();
        destroy_each(each_blocks, detaching);
        if (if_block2)
          if_block2.d();
        if (if_block3)
          if_block3.d();
        if (if_block4)
          if_block4.d();
        destroy_component(button);
        if (if_block5)
          if_block5.d();
      }
    };
  }
  function create_if_block9(ctx) {
    let div;
    return {
      c() {
        div = element("div");
        div.textContent = "No roles configured";
        attr(div, "class", "empty svelte-qkkerm");
      },
      m(target, anchor) {
        insert(target, div, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_fragment39(ctx) {
    let div2;
    let div0;
    let h3;
    let t0;
    let t1_value = (
      /*roles*/
      ctx[0].length + ""
    );
    let t1;
    let t2;
    let t3;
    let button;
    let t4;
    let t5;
    let div1;
    let each_blocks = [];
    let each_1_lookup = /* @__PURE__ */ new Map();
    let t6;
    let current;
    button = new Button_default({
      props: {
        variant: "ghost",
        $$slots: {
          icon: [create_icon_slot_32],
          default: [create_default_slot_25]
        },
        $$scope: { ctx }
      }
    });
    button.$on(
      "click",
      /*click_handler*/
      ctx[10]
    );
    let if_block0 = (
      /*showCreate*/
      ctx[2] && create_if_block_92(ctx)
    );
    let each_value = ensure_array_like(
      /*roles*/
      ctx[0]
    );
    const get_key = (ctx2) => (
      /*role*/
      ctx2[17].name
    );
    for (let i = 0; i < each_value.length; i += 1) {
      let child_ctx = get_each_context5(ctx, each_value, i);
      let key = get_key(child_ctx);
      each_1_lookup.set(key, each_blocks[i] = create_each_block5(key, child_ctx));
    }
    let if_block1 = (
      /*roles*/
      ctx[0].length === 0 && create_if_block9(ctx)
    );
    return {
      c() {
        div2 = element("div");
        div0 = element("div");
        h3 = element("h3");
        t0 = text("Roles (");
        t1 = text(t1_value);
        t2 = text(")");
        t3 = space();
        create_component(button.$$.fragment);
        t4 = space();
        if (if_block0)
          if_block0.c();
        t5 = space();
        div1 = element("div");
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        t6 = space();
        if (if_block1)
          if_block1.c();
        attr(h3, "class", "svelte-qkkerm");
        attr(div0, "class", "list-header svelte-qkkerm");
        attr(div1, "class", "role-grid svelte-qkkerm");
        attr(div2, "class", "role-list svelte-qkkerm");
      },
      m(target, anchor) {
        insert(target, div2, anchor);
        append(div2, div0);
        append(div0, h3);
        append(h3, t0);
        append(h3, t1);
        append(h3, t2);
        append(div0, t3);
        mount_component(button, div0, null);
        append(div2, t4);
        if (if_block0)
          if_block0.m(div2, null);
        append(div2, t5);
        append(div2, div1);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(div1, null);
          }
        }
        append(div2, t6);
        if (if_block1)
          if_block1.m(div2, null);
        current = true;
      },
      p(ctx2, [dirty]) {
        if ((!current || dirty & /*roles*/
        1) && t1_value !== (t1_value = /*roles*/
        ctx2[0].length + ""))
          set_data(t1, t1_value);
        const button_changes = {};
        if (dirty & /*$$scope*/
        8388608) {
          button_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button.$set(button_changes);
        if (
          /*showCreate*/
          ctx2[2]
        ) {
          if (if_block0) {
            if_block0.p(ctx2, dirty);
            if (dirty & /*showCreate*/
            4) {
              transition_in(if_block0, 1);
            }
          } else {
            if_block0 = create_if_block_92(ctx2);
            if_block0.c();
            transition_in(if_block0, 1);
            if_block0.m(div2, t5);
          }
        } else if (if_block0) {
          group_outros();
          transition_out(if_block0, 1, 1, () => {
            if_block0 = null;
          });
          check_outros();
        }
        if (dirty & /*roles, handleDelete, onEditRole, ALL_PERMISSIONS*/
        387) {
          each_value = ensure_array_like(
            /*roles*/
            ctx2[0]
          );
          group_outros();
          each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx2, each_value, each_1_lookup, div1, outro_and_destroy_block, create_each_block5, null, get_each_context5);
          check_outros();
        }
        if (
          /*roles*/
          ctx2[0].length === 0
        ) {
          if (if_block1) {
          } else {
            if_block1 = create_if_block9(ctx2);
            if_block1.c();
            if_block1.m(div2, null);
          }
        } else if (if_block1) {
          if_block1.d(1);
          if_block1 = null;
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(button.$$.fragment, local);
        transition_in(if_block0);
        for (let i = 0; i < each_value.length; i += 1) {
          transition_in(each_blocks[i]);
        }
        current = true;
      },
      o(local) {
        transition_out(button.$$.fragment, local);
        transition_out(if_block0);
        for (let i = 0; i < each_blocks.length; i += 1) {
          transition_out(each_blocks[i]);
        }
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div2);
        }
        destroy_component(button);
        if (if_block0)
          if_block0.d();
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].d();
        }
        if (if_block1)
          if_block1.d();
      }
    };
  }
  function instance39($$self, $$props, $$invalidate) {
    let { roles = [] } = $$props;
    let { refresh = () => {
    } } = $$props;
    let { onEditRole = () => {
    } } = $$props;
    const dispatch2 = createEventDispatcher();
    let showCreate = false;
    let createName = "";
    let createDisplayName = "";
    let createError = "";
    async function handleCreate() {
      $$invalidate(5, createError = "");
      if (!createName.trim()) {
        $$invalidate(5, createError = "Name required");
        return;
      }
      try {
        const res = await fetch("/api/admin/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: createName.trim(),
            displayName: createDisplayName || createName.trim()
          })
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed");
        }
        $$invalidate(2, showCreate = false);
        $$invalidate(3, createName = "");
        $$invalidate(4, createDisplayName = "");
        refresh();
      } catch (e) {
        $$invalidate(5, createError = e.message);
      }
    }
    async function handleDelete(name) {
      if (!confirm(`Delete role "${name}"? Users assigned to this role will lose their permissions.`))
        return;
      try {
        const res = await fetch(`/api/admin/roles/${encodeURIComponent(name)}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed");
        }
        refresh();
      } catch (e) {
        alert(e.message);
      }
    }
    const ALL_PERMISSIONS = [
      {
        id: "file:read",
        label: "Read files",
        icon: eye_default
      },
      {
        id: "file:write",
        label: "Edit files",
        icon: pen_default
      },
      {
        id: "file:create",
        label: "Create files/folders",
        icon: folder_plus_default
      },
      {
        id: "file:delete",
        label: "Delete files/folders",
        icon: trash_2_default
      },
      {
        id: "file:rename",
        label: "Rename files",
        icon: square_pen_default
      },
      {
        id: "vault:read",
        label: "Access vault",
        icon: vault_default
      },
      {
        id: "vault:create",
        label: "Create vaults",
        icon: square_pen_default
      },
      {
        id: "vault:delete",
        label: "Delete vaults",
        icon: trash_default
      },
      {
        id: "admin:*",
        label: "Admin panel",
        icon: shield_default
      }
    ];
    const click_handler = () => $$invalidate(2, showCreate = !showCreate);
    function input0_input_handler() {
      createName = this.value;
      $$invalidate(3, createName);
    }
    function input1_input_handler() {
      createDisplayName = this.value;
      $$invalidate(4, createDisplayName);
    }
    const click_handler_1 = () => {
      $$invalidate(2, showCreate = false);
      $$invalidate(5, createError = "");
    };
    const click_handler_2 = (role) => onEditRole(role);
    const click_handler_3 = (role) => handleDelete(role.name);
    $$self.$$set = ($$props2) => {
      if ("roles" in $$props2)
        $$invalidate(0, roles = $$props2.roles);
      if ("refresh" in $$props2)
        $$invalidate(9, refresh = $$props2.refresh);
      if ("onEditRole" in $$props2)
        $$invalidate(1, onEditRole = $$props2.onEditRole);
    };
    return [
      roles,
      onEditRole,
      showCreate,
      createName,
      createDisplayName,
      createError,
      handleCreate,
      handleDelete,
      ALL_PERMISSIONS,
      refresh,
      click_handler,
      input0_input_handler,
      input1_input_handler,
      click_handler_1,
      click_handler_2,
      click_handler_3
    ];
  }
  var RoleList = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance39, create_fragment39, safe_not_equal, { roles: 0, refresh: 9, onEditRole: 1 }, add_css13);
    }
  };
  var RoleList_default = RoleList;

  // packages/ui/src/views/admin/RoleEditor.svelte
  function add_css14(target) {
    append_styles(target, "svelte-1myezjc", '.role-editor.svelte-1myezjc.svelte-1myezjc{display:flex;flex-direction:column;gap:0.75rem;padding:1rem;background:var(--background-primary-alt);border:1px solid var(--background-modifier-border);border-radius:10px;margin-bottom:0.75rem}.editor-header.svelte-1myezjc.svelte-1myezjc{display:flex;align-items:center;gap:0.4rem;font-size:0.9375rem;font-weight:600;color:var(--text-normal)}.role-id.svelte-1myezjc.svelte-1myezjc{font-weight:400;font-size:0.75rem;color:var(--text-muted)}.editor-body.svelte-1myezjc.svelte-1myezjc{display:flex;flex-direction:column;gap:0.5rem}label.svelte-1myezjc.svelte-1myezjc{display:flex;flex-direction:column;gap:0.25rem;font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px}label.svelte-1myezjc input.svelte-1myezjc:not([type="checkbox"]),select.svelte-1myezjc.svelte-1myezjc{padding:6px 10px;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:6px;color:var(--text-normal);font-size:0.8125rem;outline:none}.section-label.svelte-1myezjc.svelte-1myezjc{display:flex;align-items:center;gap:0.375rem;font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid var(--background-modifier-border)}.perm-sections.svelte-1myezjc.svelte-1myezjc{display:flex;gap:0.25rem}.section-tab.svelte-1myezjc.svelte-1myezjc{padding:4px 12px;border:1px solid var(--background-modifier-border);background:var(--background-primary);border-radius:4px;font-size:0.75rem;color:var(--text-muted);cursor:pointer}.section-tab.active.svelte-1myezjc.svelte-1myezjc{background:var(--interactive-accent);color:white;border-color:var(--interactive-accent)}.perm-checks.svelte-1myezjc.svelte-1myezjc{display:flex;flex-direction:column;gap:0.375rem;padding:0.5rem;background:var(--background-primary);border-radius:6px;border:1px solid var(--background-modifier-border)}.perm-check.svelte-1myezjc.svelte-1myezjc{display:flex;flex-direction:row;align-items:center;gap:0.5rem;font-size:0.8125rem;color:var(--text-normal);text-transform:none;letter-spacing:0;cursor:pointer}.perm-presets.svelte-1myezjc.svelte-1myezjc{display:flex;gap:1.5rem;padding:0.5rem;background:var(--background-primary);border-radius:6px;border:1px dashed var(--text-accent);margin-bottom:0.5rem}.fa-config.svelte-1myezjc.svelte-1myezjc{display:flex;flex-direction:column;gap:0.5rem}.form-error.svelte-1myezjc.svelte-1myezjc{color:var(--text-error);font-size:0.75rem;background:rgba(255, 0, 0, 0.08);padding:0.5rem;border-radius:6px}.editor-footer.svelte-1myezjc.svelte-1myezjc{display:flex;justify-content:flex-end;gap:0.5rem}');
  }
  function get_each_context6(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[47] = list[i];
    return child_ctx;
  }
  function create_each_block6(ctx) {
    let button;
    let mounted;
    let dispose;
    function click_handler() {
      return (
        /*click_handler*/
        ctx[24](
          /*section*/
          ctx[47]
        )
      );
    }
    return {
      c() {
        button = element("button");
        button.textContent = `${/*section*/
        ctx[47]} `;
        attr(button, "class", "section-tab svelte-1myezjc");
        toggle_class(
          button,
          "active",
          /*activeSection*/
          ctx[14] === /*section*/
          ctx[47]
        );
      },
      m(target, anchor) {
        insert(target, button, anchor);
        if (!mounted) {
          dispose = listen(button, "click", click_handler);
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (dirty[0] & /*activeSection, sections*/
        540672) {
          toggle_class(
            button,
            "active",
            /*activeSection*/
            ctx[14] === /*section*/
            ctx[47]
          );
        }
      },
      d(detaching) {
        if (detaching) {
          detach(button);
        }
        mounted = false;
        dispose();
      }
    };
  }
  function create_if_block_43(ctx) {
    let label;
    let input;
    let input_checked_value;
    let t0;
    let shield;
    let t1;
    let current;
    let mounted;
    let dispose;
    shield = new shield_default({ props: { size: "0.875rem" } });
    return {
      c() {
        label = element("label");
        input = element("input");
        t0 = space();
        create_component(shield.$$.fragment);
        t1 = text("\n          Admin panel \u2014 manage users/roles/vaults");
        attr(input, "type", "checkbox");
        input.checked = input_checked_value = /*allSet*/
        ctx[15] || /*permissions*/
        ctx[2].includes("admin:*");
        input.disabled = /*allSet*/
        ctx[15];
        attr(input, "class", "svelte-1myezjc");
        attr(label, "class", "perm-check svelte-1myezjc");
      },
      m(target, anchor) {
        insert(target, label, anchor);
        append(label, input);
        append(label, t0);
        mount_component(shield, label, null);
        append(label, t1);
        current = true;
        if (!mounted) {
          dispose = listen(
            input,
            "change",
            /*change_handler_10*/
            ctx[33]
          );
          mounted = true;
        }
      },
      p(ctx2, dirty) {
        if (!current || dirty[0] & /*allSet, permissions*/
        32772 && input_checked_value !== (input_checked_value = /*allSet*/
        ctx2[15] || /*permissions*/
        ctx2[2].includes("admin:*"))) {
          input.checked = input_checked_value;
        }
        if (!current || dirty[0] & /*allSet*/
        32768) {
          input.disabled = /*allSet*/
          ctx2[15];
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(shield.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(shield.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(label);
        }
        destroy_component(shield);
        mounted = false;
        dispose();
      }
    };
  }
  function create_if_block_35(ctx) {
    let label0;
    let input0;
    let input0_checked_value;
    let t0;
    let vault;
    let t1;
    let t2;
    let label1;
    let input1;
    let input1_checked_value;
    let t3;
    let plus;
    let t4;
    let t5;
    let label2;
    let input2;
    let input2_checked_value;
    let t6;
    let trash2;
    let t7;
    let current;
    let mounted;
    let dispose;
    vault = new vault_default({ props: { size: "0.875rem" } });
    plus = new plus_default({ props: { size: "0.875rem" } });
    trash2 = new trash_2_default({ props: { size: "0.875rem" } });
    return {
      c() {
        label0 = element("label");
        input0 = element("input");
        t0 = space();
        create_component(vault.$$.fragment);
        t1 = text("\n          Vault access \u2014 enter vault");
        t2 = space();
        label1 = element("label");
        input1 = element("input");
        t3 = space();
        create_component(plus.$$.fragment);
        t4 = text("\n          Create vaults");
        t5 = space();
        label2 = element("label");
        input2 = element("input");
        t6 = space();
        create_component(trash2.$$.fragment);
        t7 = text("\n          Delete vaults");
        attr(input0, "type", "checkbox");
        input0.checked = input0_checked_value = /*allSet*/
        ctx[15] || /*permissions*/
        ctx[2].includes("vault:read");
        input0.disabled = /*allSet*/
        ctx[15];
        attr(input0, "class", "svelte-1myezjc");
        attr(label0, "class", "perm-check svelte-1myezjc");
        attr(input1, "type", "checkbox");
        input1.checked = input1_checked_value = /*allSet*/
        ctx[15] || /*permissions*/
        ctx[2].includes("vault:create");
        input1.disabled = /*allSet*/
        ctx[15];
        attr(input1, "class", "svelte-1myezjc");
        attr(label1, "class", "perm-check svelte-1myezjc");
        attr(input2, "type", "checkbox");
        input2.checked = input2_checked_value = /*allSet*/
        ctx[15] || /*permissions*/
        ctx[2].includes("vault:delete");
        input2.disabled = /*allSet*/
        ctx[15];
        attr(input2, "class", "svelte-1myezjc");
        attr(label2, "class", "perm-check svelte-1myezjc");
      },
      m(target, anchor) {
        insert(target, label0, anchor);
        append(label0, input0);
        append(label0, t0);
        mount_component(vault, label0, null);
        append(label0, t1);
        insert(target, t2, anchor);
        insert(target, label1, anchor);
        append(label1, input1);
        append(label1, t3);
        mount_component(plus, label1, null);
        append(label1, t4);
        insert(target, t5, anchor);
        insert(target, label2, anchor);
        append(label2, input2);
        append(label2, t6);
        mount_component(trash2, label2, null);
        append(label2, t7);
        current = true;
        if (!mounted) {
          dispose = [
            listen(
              input0,
              "change",
              /*change_handler_7*/
              ctx[30]
            ),
            listen(
              input1,
              "change",
              /*change_handler_8*/
              ctx[31]
            ),
            listen(
              input2,
              "change",
              /*change_handler_9*/
              ctx[32]
            )
          ];
          mounted = true;
        }
      },
      p(ctx2, dirty) {
        if (!current || dirty[0] & /*allSet, permissions*/
        32772 && input0_checked_value !== (input0_checked_value = /*allSet*/
        ctx2[15] || /*permissions*/
        ctx2[2].includes("vault:read"))) {
          input0.checked = input0_checked_value;
        }
        if (!current || dirty[0] & /*allSet*/
        32768) {
          input0.disabled = /*allSet*/
          ctx2[15];
        }
        if (!current || dirty[0] & /*allSet, permissions*/
        32772 && input1_checked_value !== (input1_checked_value = /*allSet*/
        ctx2[15] || /*permissions*/
        ctx2[2].includes("vault:create"))) {
          input1.checked = input1_checked_value;
        }
        if (!current || dirty[0] & /*allSet*/
        32768) {
          input1.disabled = /*allSet*/
          ctx2[15];
        }
        if (!current || dirty[0] & /*allSet, permissions*/
        32772 && input2_checked_value !== (input2_checked_value = /*allSet*/
        ctx2[15] || /*permissions*/
        ctx2[2].includes("vault:delete"))) {
          input2.checked = input2_checked_value;
        }
        if (!current || dirty[0] & /*allSet*/
        32768) {
          input2.disabled = /*allSet*/
          ctx2[15];
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(vault.$$.fragment, local);
        transition_in(plus.$$.fragment, local);
        transition_in(trash2.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(vault.$$.fragment, local);
        transition_out(plus.$$.fragment, local);
        transition_out(trash2.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(label0);
          detach(t2);
          detach(label1);
          detach(t5);
          detach(label2);
        }
        destroy_component(vault);
        destroy_component(plus);
        destroy_component(trash2);
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function create_if_block_25(ctx) {
    let label0;
    let input0;
    let input0_checked_value;
    let t0;
    let eye;
    let t1;
    let t2;
    let label1;
    let input1;
    let input1_checked_value;
    let t3;
    let pen0;
    let t4;
    let t5;
    let label2;
    let input2;
    let input2_checked_value;
    let t6;
    let plus;
    let t7;
    let t8;
    let label3;
    let input3;
    let input3_checked_value;
    let t9;
    let trash2;
    let t10;
    let t11;
    let label4;
    let input4;
    let input4_checked_value;
    let t12;
    let pen1;
    let t13;
    let current;
    let mounted;
    let dispose;
    eye = new eye_default({ props: { size: "0.875rem" } });
    pen0 = new pen_default({ props: { size: "0.875rem" } });
    plus = new plus_default({ props: { size: "0.875rem" } });
    trash2 = new trash_2_default({ props: { size: "0.875rem" } });
    pen1 = new pen_default({ props: { size: "0.875rem" } });
    return {
      c() {
        label0 = element("label");
        input0 = element("input");
        t0 = space();
        create_component(eye.$$.fragment);
        t1 = text("\n          Read files \u2014 view content");
        t2 = space();
        label1 = element("label");
        input1 = element("input");
        t3 = space();
        create_component(pen0.$$.fragment);
        t4 = text("\n          Edit files \u2014 modify content");
        t5 = space();
        label2 = element("label");
        input2 = element("input");
        t6 = space();
        create_component(plus.$$.fragment);
        t7 = text("\n          Create \u2014 new files/folders");
        t8 = space();
        label3 = element("label");
        input3 = element("input");
        t9 = space();
        create_component(trash2.$$.fragment);
        t10 = text("\n          Delete \u2014 remove files/folders");
        t11 = space();
        label4 = element("label");
        input4 = element("input");
        t12 = space();
        create_component(pen1.$$.fragment);
        t13 = text("\n          Rename \u2014 rename files/folders");
        attr(input0, "type", "checkbox");
        input0.checked = input0_checked_value = /*allSet*/
        ctx[15] || /*permissions*/
        ctx[2].includes("file:read");
        attr(input0, "class", "svelte-1myezjc");
        attr(label0, "class", "perm-check svelte-1myezjc");
        attr(input1, "type", "checkbox");
        input1.checked = input1_checked_value = /*allSet*/
        ctx[15] || /*permissions*/
        ctx[2].includes("file:write");
        attr(input1, "class", "svelte-1myezjc");
        attr(label1, "class", "perm-check svelte-1myezjc");
        attr(input2, "type", "checkbox");
        input2.checked = input2_checked_value = /*allSet*/
        ctx[15] || /*permissions*/
        ctx[2].includes("file:create");
        attr(input2, "class", "svelte-1myezjc");
        attr(label2, "class", "perm-check svelte-1myezjc");
        attr(input3, "type", "checkbox");
        input3.checked = input3_checked_value = /*allSet*/
        ctx[15] || /*permissions*/
        ctx[2].includes("file:delete");
        attr(input3, "class", "svelte-1myezjc");
        attr(label3, "class", "perm-check svelte-1myezjc");
        attr(input4, "type", "checkbox");
        input4.checked = input4_checked_value = /*allSet*/
        ctx[15] || /*permissions*/
        ctx[2].includes("file:rename");
        attr(input4, "class", "svelte-1myezjc");
        attr(label4, "class", "perm-check svelte-1myezjc");
      },
      m(target, anchor) {
        insert(target, label0, anchor);
        append(label0, input0);
        append(label0, t0);
        mount_component(eye, label0, null);
        append(label0, t1);
        insert(target, t2, anchor);
        insert(target, label1, anchor);
        append(label1, input1);
        append(label1, t3);
        mount_component(pen0, label1, null);
        append(label1, t4);
        insert(target, t5, anchor);
        insert(target, label2, anchor);
        append(label2, input2);
        append(label2, t6);
        mount_component(plus, label2, null);
        append(label2, t7);
        insert(target, t8, anchor);
        insert(target, label3, anchor);
        append(label3, input3);
        append(label3, t9);
        mount_component(trash2, label3, null);
        append(label3, t10);
        insert(target, t11, anchor);
        insert(target, label4, anchor);
        append(label4, input4);
        append(label4, t12);
        mount_component(pen1, label4, null);
        append(label4, t13);
        current = true;
        if (!mounted) {
          dispose = [
            listen(
              input0,
              "change",
              /*change_handler_2*/
              ctx[25]
            ),
            listen(
              input1,
              "change",
              /*change_handler_3*/
              ctx[26]
            ),
            listen(
              input2,
              "change",
              /*change_handler_4*/
              ctx[27]
            ),
            listen(
              input3,
              "change",
              /*change_handler_5*/
              ctx[28]
            ),
            listen(
              input4,
              "change",
              /*change_handler_6*/
              ctx[29]
            )
          ];
          mounted = true;
        }
      },
      p(ctx2, dirty) {
        if (!current || dirty[0] & /*allSet, permissions*/
        32772 && input0_checked_value !== (input0_checked_value = /*allSet*/
        ctx2[15] || /*permissions*/
        ctx2[2].includes("file:read"))) {
          input0.checked = input0_checked_value;
        }
        if (!current || dirty[0] & /*allSet, permissions*/
        32772 && input1_checked_value !== (input1_checked_value = /*allSet*/
        ctx2[15] || /*permissions*/
        ctx2[2].includes("file:write"))) {
          input1.checked = input1_checked_value;
        }
        if (!current || dirty[0] & /*allSet, permissions*/
        32772 && input2_checked_value !== (input2_checked_value = /*allSet*/
        ctx2[15] || /*permissions*/
        ctx2[2].includes("file:create"))) {
          input2.checked = input2_checked_value;
        }
        if (!current || dirty[0] & /*allSet, permissions*/
        32772 && input3_checked_value !== (input3_checked_value = /*allSet*/
        ctx2[15] || /*permissions*/
        ctx2[2].includes("file:delete"))) {
          input3.checked = input3_checked_value;
        }
        if (!current || dirty[0] & /*allSet, permissions*/
        32772 && input4_checked_value !== (input4_checked_value = /*allSet*/
        ctx2[15] || /*permissions*/
        ctx2[2].includes("file:rename"))) {
          input4.checked = input4_checked_value;
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(eye.$$.fragment, local);
        transition_in(pen0.$$.fragment, local);
        transition_in(plus.$$.fragment, local);
        transition_in(trash2.$$.fragment, local);
        transition_in(pen1.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(eye.$$.fragment, local);
        transition_out(pen0.$$.fragment, local);
        transition_out(plus.$$.fragment, local);
        transition_out(trash2.$$.fragment, local);
        transition_out(pen1.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(label0);
          detach(t2);
          detach(label1);
          detach(t5);
          detach(label2);
          detach(t8);
          detach(label3);
          detach(t11);
          detach(label4);
        }
        destroy_component(eye);
        destroy_component(pen0);
        destroy_component(plus);
        destroy_component(trash2);
        destroy_component(pen1);
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function create_if_block_16(ctx) {
    let label0;
    let t0;
    let input0;
    let t1;
    let label1;
    let t2;
    let input1;
    let t3;
    let label2;
    let t4;
    let input2;
    let t5;
    let label3;
    let t6;
    let input3;
    let t7;
    let label4;
    let input4;
    let t8;
    let mounted;
    let dispose;
    return {
      c() {
        label0 = element("label");
        t0 = text('Paths (comma-separated globs, e.g. "public/**, docs/*.md")\n          ');
        input0 = element("input");
        t1 = space();
        label1 = element("label");
        t2 = text("Tags (comma-separated)\n          ");
        input1 = element("input");
        t3 = space();
        label2 = element("label");
        t4 = text("Exclude paths (override above)\n          ");
        input2 = element("input");
        t5 = space();
        label3 = element("label");
        t6 = text("Exclude tags\n          ");
        input3 = element("input");
        t7 = space();
        label4 = element("label");
        input4 = element("input");
        t8 = text("\n          Hide inaccessible files in file explorer (recommended)");
        attr(input0, "type", "text");
        attr(input0, "placeholder", "public/**");
        attr(input0, "class", "svelte-1myezjc");
        attr(label0, "class", "svelte-1myezjc");
        attr(input1, "type", "text");
        attr(input1, "placeholder", "private, draft");
        attr(input1, "class", "svelte-1myezjc");
        attr(label1, "class", "svelte-1myezjc");
        attr(input2, "type", "text");
        attr(input2, "placeholder", "public/admin/**");
        attr(input2, "class", "svelte-1myezjc");
        attr(label2, "class", "svelte-1myezjc");
        attr(input3, "type", "text");
        attr(input3, "placeholder", "secret");
        attr(input3, "class", "svelte-1myezjc");
        attr(label3, "class", "svelte-1myezjc");
        attr(input4, "type", "checkbox");
        attr(input4, "class", "svelte-1myezjc");
        attr(label4, "class", "perm-check svelte-1myezjc");
      },
      m(target, anchor) {
        insert(target, label0, anchor);
        append(label0, t0);
        append(label0, input0);
        set_input_value(
          input0,
          /*fileAccessPaths*/
          ctx[5]
        );
        insert(target, t1, anchor);
        insert(target, label1, anchor);
        append(label1, t2);
        append(label1, input1);
        set_input_value(
          input1,
          /*fileAccessTags*/
          ctx[6]
        );
        insert(target, t3, anchor);
        insert(target, label2, anchor);
        append(label2, t4);
        append(label2, input2);
        set_input_value(
          input2,
          /*fileAccessExcludePaths*/
          ctx[7]
        );
        insert(target, t5, anchor);
        insert(target, label3, anchor);
        append(label3, t6);
        append(label3, input3);
        set_input_value(
          input3,
          /*fileAccessExcludeTags*/
          ctx[8]
        );
        insert(target, t7, anchor);
        insert(target, label4, anchor);
        append(label4, input4);
        input4.checked = /*hideInaccessible*/
        ctx[11];
        append(label4, t8);
        if (!mounted) {
          dispose = [
            listen(
              input0,
              "input",
              /*input0_input_handler_1*/
              ctx[35]
            ),
            listen(
              input1,
              "input",
              /*input1_input_handler*/
              ctx[36]
            ),
            listen(
              input2,
              "input",
              /*input2_input_handler*/
              ctx[37]
            ),
            listen(
              input3,
              "input",
              /*input3_input_handler*/
              ctx[38]
            ),
            listen(
              input4,
              "change",
              /*input4_change_handler*/
              ctx[39]
            )
          ];
          mounted = true;
        }
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*fileAccessPaths*/
        32 && input0.value !== /*fileAccessPaths*/
        ctx2[5]) {
          set_input_value(
            input0,
            /*fileAccessPaths*/
            ctx2[5]
          );
        }
        if (dirty[0] & /*fileAccessTags*/
        64 && input1.value !== /*fileAccessTags*/
        ctx2[6]) {
          set_input_value(
            input1,
            /*fileAccessTags*/
            ctx2[6]
          );
        }
        if (dirty[0] & /*fileAccessExcludePaths*/
        128 && input2.value !== /*fileAccessExcludePaths*/
        ctx2[7]) {
          set_input_value(
            input2,
            /*fileAccessExcludePaths*/
            ctx2[7]
          );
        }
        if (dirty[0] & /*fileAccessExcludeTags*/
        256 && input3.value !== /*fileAccessExcludeTags*/
        ctx2[8]) {
          set_input_value(
            input3,
            /*fileAccessExcludeTags*/
            ctx2[8]
          );
        }
        if (dirty[0] & /*hideInaccessible*/
        2048) {
          input4.checked = /*hideInaccessible*/
          ctx2[11];
        }
      },
      d(detaching) {
        if (detaching) {
          detach(label0);
          detach(t1);
          detach(label1);
          detach(t3);
          detach(label2);
          detach(t5);
          detach(label3);
          detach(t7);
          detach(label4);
        }
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function create_if_block10(ctx) {
    let div;
    let t;
    return {
      c() {
        div = element("div");
        t = text(
          /*error*/
          ctx[13]
        );
        attr(div, "class", "form-error svelte-1myezjc");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*error*/
        8192)
          set_data(
            t,
            /*error*/
            ctx2[13]
          );
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_default_slot_17(ctx) {
    let t;
    return {
      c() {
        t = text("Cancel");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_icon_slot_16(ctx) {
    let x3;
    let current;
    x3 = new x_default({ props: { size: "0.875rem" } });
    return {
      c() {
        create_component(x3.$$.fragment);
      },
      m(target, anchor) {
        mount_component(x3, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(x3.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(x3.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(x3, detaching);
      }
    };
  }
  function create_default_slot33(ctx) {
    let t_value = (
      /*saving*/
      ctx[12] ? "Saving..." : "Save"
    );
    let t;
    return {
      c() {
        t = text(t_value);
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*saving*/
        4096 && t_value !== (t_value = /*saving*/
        ctx2[12] ? "Saving..." : "Save"))
          set_data(t, t_value);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_icon_slot7(ctx) {
    let check;
    let current;
    check = new check_default({ props: { size: "0.875rem" } });
    return {
      c() {
        create_component(check.$$.fragment);
      },
      m(target, anchor) {
        mount_component(check, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(check.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(check.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(check, detaching);
      }
    };
  }
  function create_fragment40(ctx) {
    var _a, _b, _c;
    let div11;
    let div0;
    let shield0;
    let t0;
    let span0;
    let t1;
    let t2_value = (
      /*role*/
      (((_a = ctx[0]) == null ? void 0 : _a.displayName) || /*role*/
      ((_b = ctx[0]) == null ? void 0 : _b.name)) + ""
    );
    let t2;
    let t3;
    let span1;
    let t4_value = (
      /*role*/
      ((_c = ctx[0]) == null ? void 0 : _c.builtin) ? "(built-in)" : ""
    );
    let t4;
    let t5;
    let div9;
    let label0;
    let t6;
    let input0;
    let input0_disabled_value;
    let t7;
    let div1;
    let t9;
    let div2;
    let label1;
    let input1;
    let t10;
    let shield1;
    let t11;
    let strong0;
    let t13;
    let t14;
    let label2;
    let input2;
    let t15;
    let shield2;
    let t16;
    let strong1;
    let t18;
    let t19;
    let div3;
    let t20;
    let div4;
    let current_block_type_index;
    let if_block0;
    let t21;
    let div5;
    let folderkey;
    let t22;
    let t23;
    let div6;
    let select;
    let option0;
    let option1;
    let option2;
    let t27;
    let t28;
    let div7;
    let ribbon;
    let t29;
    let t30;
    let label3;
    let t31;
    let input3;
    let t32;
    let div8;
    let menusquare;
    let t33;
    let t34;
    let label4;
    let t35;
    let input4;
    let t36;
    let t37;
    let div10;
    let button0;
    let t38;
    let button1;
    let current;
    let mounted;
    let dispose;
    shield0 = new shield_default({ props: { size: "1.125rem" } });
    shield1 = new shield_default({ props: { size: "0.875rem" } });
    shield2 = new shield_default({ props: { size: "0.875rem" } });
    let each_value = ensure_array_like(
      /*sections*/
      ctx[19]
    );
    let each_blocks = [];
    for (let i = 0; i < each_value.length; i += 1) {
      each_blocks[i] = create_each_block6(get_each_context6(ctx, each_value, i));
    }
    const if_block_creators = [create_if_block_25, create_if_block_35, create_if_block_43];
    const if_blocks = [];
    function select_block_type(ctx2, dirty) {
      if (
        /*activeSection*/
        ctx2[14] === "Files" && !/*allSet*/
        ctx2[15]
      )
        return 0;
      if (
        /*activeSection*/
        ctx2[14] === "Vaults"
      )
        return 1;
      if (
        /*activeSection*/
        ctx2[14] === "Admin"
      )
        return 2;
      return -1;
    }
    if (~(current_block_type_index = select_block_type(ctx, [-1, -1]))) {
      if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    }
    folderkey = new folder_key_default({ props: { size: "0.875rem" } });
    let if_block1 = (
      /*fileAccessType*/
      ctx[4] && create_if_block_16(ctx)
    );
    ribbon = new ribbon_default({ props: { size: "0.875rem" } });
    menusquare = new square_menu_default({ props: { size: "0.875rem" } });
    let if_block2 = (
      /*error*/
      ctx[13] && create_if_block10(ctx)
    );
    button0 = new Button_default({
      props: {
        variant: "ghost",
        $$slots: {
          icon: [create_icon_slot_16],
          default: [create_default_slot_17]
        },
        $$scope: { ctx }
      }
    });
    button0.$on("click", function() {
      if (is_function(
        /*onClose*/
        ctx[1]
      ))
        ctx[1].apply(this, arguments);
    });
    button1 = new Button_default({
      props: {
        variant: "primary",
        disabled: (
          /*saving*/
          ctx[12]
        ),
        $$slots: {
          icon: [create_icon_slot7],
          default: [create_default_slot33]
        },
        $$scope: { ctx }
      }
    });
    button1.$on(
      "click",
      /*handleSave*/
      ctx[18]
    );
    return {
      c() {
        var _a2;
        div11 = element("div");
        div0 = element("div");
        create_component(shield0.$$.fragment);
        t0 = space();
        span0 = element("span");
        t1 = text("Edit Role: ");
        t2 = text(t2_value);
        t3 = space();
        span1 = element("span");
        t4 = text(t4_value);
        t5 = space();
        div9 = element("div");
        label0 = element("label");
        t6 = text("Display name\n      ");
        input0 = element("input");
        t7 = space();
        div1 = element("div");
        div1.textContent = "Permissions";
        t9 = space();
        div2 = element("div");
        label1 = element("label");
        input1 = element("input");
        t10 = space();
        create_component(shield1.$$.fragment);
        t11 = space();
        strong0 = element("strong");
        strong0.textContent = "Read-only";
        t13 = text(" \u2014 view files, no editing");
        t14 = space();
        label2 = element("label");
        input2 = element("input");
        t15 = space();
        create_component(shield2.$$.fragment);
        t16 = space();
        strong1 = element("strong");
        strong1.textContent = "All permissions";
        t18 = text(" \u2014 super-admin");
        t19 = space();
        div3 = element("div");
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        t20 = space();
        div4 = element("div");
        if (if_block0)
          if_block0.c();
        t21 = space();
        div5 = element("div");
        create_component(folderkey.$$.fragment);
        t22 = text(" File Access Rules");
        t23 = space();
        div6 = element("div");
        select = element("select");
        option0 = element("option");
        option0.textContent = "No restrictions (all files)";
        option1 = element("option");
        option1.textContent = "Whitelist \u2014 only allowed";
        option2 = element("option");
        option2.textContent = "Blacklist \u2014 block specific";
        t27 = space();
        if (if_block1)
          if_block1.c();
        t28 = space();
        div7 = element("div");
        create_component(ribbon.$$.fragment);
        t29 = text(" Ribbon \u2014 Hidden Plugin IDs");
        t30 = space();
        label3 = element("label");
        t31 = text("Plugin IDs (comma-separated)\n      ");
        input3 = element("input");
        t32 = space();
        div8 = element("div");
        create_component(menusquare.$$.fragment);
        t33 = text(" Context Menu \u2014 Hidden Items");
        t34 = space();
        label4 = element("label");
        t35 = text("Menu item labels (comma-separated, English text)\n      ");
        input4 = element("input");
        t36 = space();
        if (if_block2)
          if_block2.c();
        t37 = space();
        div10 = element("div");
        create_component(button0.$$.fragment);
        t38 = space();
        create_component(button1.$$.fragment);
        attr(span1, "class", "role-id svelte-1myezjc");
        attr(div0, "class", "editor-header svelte-1myezjc");
        attr(input0, "type", "text");
        input0.disabled = input0_disabled_value = /*role*/
        (_a2 = ctx[0]) == null ? void 0 : _a2.builtin;
        attr(input0, "class", "svelte-1myezjc");
        attr(label0, "class", "svelte-1myezjc");
        attr(div1, "class", "section-label svelte-1myezjc");
        attr(input1, "type", "checkbox");
        input1.checked = /*areReadOnly*/
        ctx[16];
        attr(input1, "class", "svelte-1myezjc");
        attr(label1, "class", "perm-check svelte-1myezjc");
        attr(input2, "type", "checkbox");
        input2.checked = /*allSet*/
        ctx[15];
        attr(input2, "class", "svelte-1myezjc");
        attr(label2, "class", "perm-check svelte-1myezjc");
        attr(div2, "class", "perm-presets svelte-1myezjc");
        attr(div3, "class", "perm-sections svelte-1myezjc");
        attr(div4, "class", "perm-checks svelte-1myezjc");
        attr(div5, "class", "section-label svelte-1myezjc");
        option0.__value = "";
        set_input_value(option0, option0.__value);
        option1.__value = "whitelist";
        set_input_value(option1, option1.__value);
        option2.__value = "blacklist";
        set_input_value(option2, option2.__value);
        attr(select, "class", "svelte-1myezjc");
        if (
          /*fileAccessType*/
          ctx[4] === void 0
        )
          add_render_callback(() => (
            /*select_change_handler*/
            ctx[34].call(select)
          ));
        attr(div6, "class", "fa-config svelte-1myezjc");
        attr(div7, "class", "section-label svelte-1myezjc");
        attr(input3, "type", "text");
        attr(input3, "placeholder", "daily-notes, templates, bases");
        attr(input3, "class", "svelte-1myezjc");
        attr(label3, "class", "svelte-1myezjc");
        attr(div8, "class", "section-label svelte-1myezjc");
        attr(input4, "type", "text");
        attr(input4, "placeholder", "Delete, Rename, Make a copy");
        attr(input4, "class", "svelte-1myezjc");
        attr(label4, "class", "svelte-1myezjc");
        attr(div9, "class", "editor-body svelte-1myezjc");
        attr(div10, "class", "editor-footer svelte-1myezjc");
        attr(div11, "class", "role-editor svelte-1myezjc");
      },
      m(target, anchor) {
        insert(target, div11, anchor);
        append(div11, div0);
        mount_component(shield0, div0, null);
        append(div0, t0);
        append(div0, span0);
        append(span0, t1);
        append(span0, t2);
        append(div0, t3);
        append(div0, span1);
        append(span1, t4);
        append(div11, t5);
        append(div11, div9);
        append(div9, label0);
        append(label0, t6);
        append(label0, input0);
        set_input_value(
          input0,
          /*displayName*/
          ctx[3]
        );
        append(div9, t7);
        append(div9, div1);
        append(div9, t9);
        append(div9, div2);
        append(div2, label1);
        append(label1, input1);
        append(label1, t10);
        mount_component(shield1, label1, null);
        append(label1, t11);
        append(label1, strong0);
        append(label1, t13);
        append(div2, t14);
        append(div2, label2);
        append(label2, input2);
        append(label2, t15);
        mount_component(shield2, label2, null);
        append(label2, t16);
        append(label2, strong1);
        append(label2, t18);
        append(div9, t19);
        append(div9, div3);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(div3, null);
          }
        }
        append(div9, t20);
        append(div9, div4);
        if (~current_block_type_index) {
          if_blocks[current_block_type_index].m(div4, null);
        }
        append(div9, t21);
        append(div9, div5);
        mount_component(folderkey, div5, null);
        append(div5, t22);
        append(div9, t23);
        append(div9, div6);
        append(div6, select);
        append(select, option0);
        append(select, option1);
        append(select, option2);
        select_option(
          select,
          /*fileAccessType*/
          ctx[4],
          true
        );
        append(div6, t27);
        if (if_block1)
          if_block1.m(div6, null);
        append(div9, t28);
        append(div9, div7);
        mount_component(ribbon, div7, null);
        append(div7, t29);
        append(div9, t30);
        append(div9, label3);
        append(label3, t31);
        append(label3, input3);
        set_input_value(
          input3,
          /*ribbonHiddenPluginIds*/
          ctx[9]
        );
        append(div9, t32);
        append(div9, div8);
        mount_component(menusquare, div8, null);
        append(div8, t33);
        append(div9, t34);
        append(div9, label4);
        append(label4, t35);
        append(label4, input4);
        set_input_value(
          input4,
          /*hideMenuItems*/
          ctx[10]
        );
        append(div11, t36);
        if (if_block2)
          if_block2.m(div11, null);
        append(div11, t37);
        append(div11, div10);
        mount_component(button0, div10, null);
        append(div10, t38);
        mount_component(button1, div10, null);
        current = true;
        if (!mounted) {
          dispose = [
            listen(
              input0,
              "input",
              /*input0_input_handler*/
              ctx[21]
            ),
            listen(
              input1,
              "change",
              /*change_handler*/
              ctx[22]
            ),
            listen(
              input2,
              "change",
              /*change_handler_1*/
              ctx[23]
            ),
            listen(
              select,
              "change",
              /*select_change_handler*/
              ctx[34]
            ),
            listen(
              input3,
              "input",
              /*input3_input_handler_1*/
              ctx[40]
            ),
            listen(
              input4,
              "input",
              /*input4_input_handler*/
              ctx[41]
            )
          ];
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        var _a2, _b2, _c2, _d;
        ctx = new_ctx;
        if ((!current || dirty[0] & /*role*/
        1) && t2_value !== (t2_value = /*role*/
        (((_a2 = ctx[0]) == null ? void 0 : _a2.displayName) || /*role*/
        ((_b2 = ctx[0]) == null ? void 0 : _b2.name)) + ""))
          set_data(t2, t2_value);
        if ((!current || dirty[0] & /*role*/
        1) && t4_value !== (t4_value = /*role*/
        ((_c2 = ctx[0]) == null ? void 0 : _c2.builtin) ? "(built-in)" : ""))
          set_data(t4, t4_value);
        if (!current || dirty[0] & /*role*/
        1 && input0_disabled_value !== (input0_disabled_value = /*role*/
        (_d = ctx[0]) == null ? void 0 : _d.builtin)) {
          input0.disabled = input0_disabled_value;
        }
        if (dirty[0] & /*displayName*/
        8 && input0.value !== /*displayName*/
        ctx[3]) {
          set_input_value(
            input0,
            /*displayName*/
            ctx[3]
          );
        }
        if (!current || dirty[0] & /*areReadOnly*/
        65536) {
          input1.checked = /*areReadOnly*/
          ctx[16];
        }
        if (!current || dirty[0] & /*allSet*/
        32768) {
          input2.checked = /*allSet*/
          ctx[15];
        }
        if (dirty[0] & /*activeSection, sections*/
        540672) {
          each_value = ensure_array_like(
            /*sections*/
            ctx[19]
          );
          let i;
          for (i = 0; i < each_value.length; i += 1) {
            const child_ctx = get_each_context6(ctx, each_value, i);
            if (each_blocks[i]) {
              each_blocks[i].p(child_ctx, dirty);
            } else {
              each_blocks[i] = create_each_block6(child_ctx);
              each_blocks[i].c();
              each_blocks[i].m(div3, null);
            }
          }
          for (; i < each_blocks.length; i += 1) {
            each_blocks[i].d(1);
          }
          each_blocks.length = each_value.length;
        }
        let previous_block_index = current_block_type_index;
        current_block_type_index = select_block_type(ctx, dirty);
        if (current_block_type_index === previous_block_index) {
          if (~current_block_type_index) {
            if_blocks[current_block_type_index].p(ctx, dirty);
          }
        } else {
          if (if_block0) {
            group_outros();
            transition_out(if_blocks[previous_block_index], 1, 1, () => {
              if_blocks[previous_block_index] = null;
            });
            check_outros();
          }
          if (~current_block_type_index) {
            if_block0 = if_blocks[current_block_type_index];
            if (!if_block0) {
              if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
              if_block0.c();
            } else {
              if_block0.p(ctx, dirty);
            }
            transition_in(if_block0, 1);
            if_block0.m(div4, null);
          } else {
            if_block0 = null;
          }
        }
        if (dirty[0] & /*fileAccessType*/
        16) {
          select_option(
            select,
            /*fileAccessType*/
            ctx[4]
          );
        }
        if (
          /*fileAccessType*/
          ctx[4]
        ) {
          if (if_block1) {
            if_block1.p(ctx, dirty);
          } else {
            if_block1 = create_if_block_16(ctx);
            if_block1.c();
            if_block1.m(div6, null);
          }
        } else if (if_block1) {
          if_block1.d(1);
          if_block1 = null;
        }
        if (dirty[0] & /*ribbonHiddenPluginIds*/
        512 && input3.value !== /*ribbonHiddenPluginIds*/
        ctx[9]) {
          set_input_value(
            input3,
            /*ribbonHiddenPluginIds*/
            ctx[9]
          );
        }
        if (dirty[0] & /*hideMenuItems*/
        1024 && input4.value !== /*hideMenuItems*/
        ctx[10]) {
          set_input_value(
            input4,
            /*hideMenuItems*/
            ctx[10]
          );
        }
        if (
          /*error*/
          ctx[13]
        ) {
          if (if_block2) {
            if_block2.p(ctx, dirty);
          } else {
            if_block2 = create_if_block10(ctx);
            if_block2.c();
            if_block2.m(div11, t37);
          }
        } else if (if_block2) {
          if_block2.d(1);
          if_block2 = null;
        }
        const button0_changes = {};
        if (dirty[1] & /*$$scope*/
        524288) {
          button0_changes.$$scope = { dirty, ctx };
        }
        button0.$set(button0_changes);
        const button1_changes = {};
        if (dirty[0] & /*saving*/
        4096)
          button1_changes.disabled = /*saving*/
          ctx[12];
        if (dirty[0] & /*saving*/
        4096 | dirty[1] & /*$$scope*/
        524288) {
          button1_changes.$$scope = { dirty, ctx };
        }
        button1.$set(button1_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(shield0.$$.fragment, local);
        transition_in(shield1.$$.fragment, local);
        transition_in(shield2.$$.fragment, local);
        transition_in(if_block0);
        transition_in(folderkey.$$.fragment, local);
        transition_in(ribbon.$$.fragment, local);
        transition_in(menusquare.$$.fragment, local);
        transition_in(button0.$$.fragment, local);
        transition_in(button1.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(shield0.$$.fragment, local);
        transition_out(shield1.$$.fragment, local);
        transition_out(shield2.$$.fragment, local);
        transition_out(if_block0);
        transition_out(folderkey.$$.fragment, local);
        transition_out(ribbon.$$.fragment, local);
        transition_out(menusquare.$$.fragment, local);
        transition_out(button0.$$.fragment, local);
        transition_out(button1.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div11);
        }
        destroy_component(shield0);
        destroy_component(shield1);
        destroy_component(shield2);
        destroy_each(each_blocks, detaching);
        if (~current_block_type_index) {
          if_blocks[current_block_type_index].d();
        }
        destroy_component(folderkey);
        if (if_block1)
          if_block1.d();
        destroy_component(ribbon);
        destroy_component(menusquare);
        if (if_block2)
          if_block2.d();
        destroy_component(button0);
        destroy_component(button1);
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function instance40($$self, $$props, $$invalidate) {
    let areReadOnly;
    let allSet;
    let { role = null } = $$props;
    let { onSave = () => {
    } } = $$props;
    let { onClose = () => {
    } } = $$props;
    const dispatch2 = createEventDispatcher();
    let displayName = "";
    let permissions = [];
    let fileAccessType = "";
    let fileAccessPaths = "";
    let fileAccessTags = "";
    let fileAccessExcludePaths = "";
    let fileAccessExcludeTags = "";
    let ribbonHiddenPluginIds = "";
    let hideMenuItems = "";
    let hideInaccessible = false;
    let saving = false;
    let error = "";
    let lastRoleName = null;
    function loadRole() {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
      if (!role)
        return;
      if (lastRoleName === role.name)
        return;
      lastRoleName = role.name;
      $$invalidate(3, displayName = role.displayName || role.name);
      $$invalidate(2, permissions = [...role.permissions || []]);
      $$invalidate(4, fileAccessType = ((_a = role.fileAccess) == null ? void 0 : _a.type) || "");
      $$invalidate(5, fileAccessPaths = (((_b = role.fileAccess) == null ? void 0 : _b.paths) || []).join(", "));
      $$invalidate(6, fileAccessTags = (((_c = role.fileAccess) == null ? void 0 : _c.tags) || []).join(", "));
      $$invalidate(7, fileAccessExcludePaths = (((_d = role.fileAccess) == null ? void 0 : _d.excludePaths) || []).join(", "));
      $$invalidate(8, fileAccessExcludeTags = (((_e = role.fileAccess) == null ? void 0 : _e.excludeTags) || []).join(", "));
      $$invalidate(9, ribbonHiddenPluginIds = (role.ribbonHiddenPluginIds || []).join(", "));
      $$invalidate(10, hideMenuItems = (role.hideMenuItems || []).join(", "));
      $$invalidate(11, hideInaccessible = ((_f = role.fileAccess) == null ? void 0 : _f.hideInaccessible) !== void 0 ? !!role.fileAccess.hideInaccessible : !!(((_g = role.fileAccess) == null ? void 0 : _g.type) && (((_i = (_h = role.fileAccess) == null ? void 0 : _h.paths) == null ? void 0 : _i.length) > 0 || ((_k = (_j = role.fileAccess) == null ? void 0 : _j.tags) == null ? void 0 : _k.length) > 0)));
    }
    loadRole();
    function togglePermission(perm) {
      if (permissions.includes(perm)) {
        $$invalidate(2, permissions = permissions.filter((p) => p !== perm));
      } else {
        $$invalidate(2, permissions = [...permissions, perm]);
      }
    }
    function hasPerm(perm) {
      return permissions.includes("*") || permissions.includes(perm);
    }
    async function handleSave() {
      $$invalidate(12, saving = true);
      $$invalidate(13, error = "");
      const body = {
        displayName: displayName.trim() || role.name,
        permissions: permissions.includes("*") ? ["*"] : permissions,
        ribbonHiddenPluginIds: ribbonHiddenPluginIds.split(",").map((s) => s.trim()).filter(Boolean),
        hideMenuItems: hideMenuItems.split(",").map((s) => s.trim()).filter(Boolean)
      };
      if (fileAccessType) {
        body.fileAccess = {
          type: fileAccessType,
          paths: fileAccessPaths.split(",").map((s) => s.trim()).filter(Boolean),
          tags: fileAccessTags.split(",").map((s) => s.trim()).filter(Boolean),
          excludePaths: fileAccessExcludePaths.split(",").map((s) => s.trim()).filter(Boolean),
          excludeTags: fileAccessExcludeTags.split(",").map((s) => s.trim()).filter(Boolean),
          hideInaccessible
        };
      } else {
        body.fileAccess = null;
      }
      try {
        const res = await fetch(`/api/admin/roles/${encodeURIComponent(role.name)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to save");
        }
        onSave();
      } catch (e) {
        $$invalidate(13, error = e.message);
      } finally {
        $$invalidate(12, saving = false);
      }
    }
    const ALL_PERMISSIONS = [
      {
        id: "file:read",
        label: "Read files",
        icon: eye_default,
        section: "Files"
      },
      {
        id: "file:write",
        label: "Edit files",
        icon: pen_default,
        section: "Files"
      },
      {
        id: "file:create",
        label: "Create files/folders",
        icon: plus_default,
        section: "Files"
      },
      {
        id: "file:delete",
        label: "Delete files/folders",
        icon: trash_2_default,
        section: "Files"
      },
      {
        id: "file:rename",
        label: "Rename files",
        icon: pen_default,
        section: "Files"
      },
      {
        id: "vault:read",
        label: "Access vault",
        icon: vault_default,
        section: "Vaults"
      },
      {
        id: "vault:create",
        label: "Create vaults",
        icon: square_pen_default,
        section: "Vaults"
      },
      {
        id: "vault:delete",
        label: "Delete vaults",
        icon: trash_2_default,
        section: "Vaults"
      },
      {
        id: "admin:*",
        label: "Admin panel access",
        icon: shield_default,
        section: "Admin"
      }
    ];
    const sections = ["Files", "Vaults", "Admin"];
    let activeSection = "Files";
    function input0_input_handler() {
      displayName = this.value;
      $$invalidate(3, displayName);
    }
    const change_handler = () => {
      if (!areReadOnly) {
        const other = permissions.filter((p) => !p.startsWith("file:") && p !== "vault:read");
        $$invalidate(2, permissions = [...other, "file:read", "vault:read"]);
      }
    };
    const change_handler_1 = () => {
      $$invalidate(2, permissions = allSet ? [] : ["*"]);
    };
    const click_handler = (section) => $$invalidate(14, activeSection = section);
    const change_handler_2 = () => togglePermission("file:read");
    const change_handler_3 = () => togglePermission("file:write");
    const change_handler_4 = () => togglePermission("file:create");
    const change_handler_5 = () => togglePermission("file:delete");
    const change_handler_6 = () => togglePermission("file:rename");
    const change_handler_7 = () => togglePermission("vault:read");
    const change_handler_8 = () => togglePermission("vault:create");
    const change_handler_9 = () => togglePermission("vault:delete");
    const change_handler_10 = () => togglePermission("admin:*");
    function select_change_handler() {
      fileAccessType = select_value(this);
      $$invalidate(4, fileAccessType);
    }
    function input0_input_handler_1() {
      fileAccessPaths = this.value;
      $$invalidate(5, fileAccessPaths);
    }
    function input1_input_handler() {
      fileAccessTags = this.value;
      $$invalidate(6, fileAccessTags);
    }
    function input2_input_handler() {
      fileAccessExcludePaths = this.value;
      $$invalidate(7, fileAccessExcludePaths);
    }
    function input3_input_handler() {
      fileAccessExcludeTags = this.value;
      $$invalidate(8, fileAccessExcludeTags);
    }
    function input4_change_handler() {
      hideInaccessible = this.checked;
      $$invalidate(11, hideInaccessible);
    }
    function input3_input_handler_1() {
      ribbonHiddenPluginIds = this.value;
      $$invalidate(9, ribbonHiddenPluginIds);
    }
    function input4_input_handler() {
      hideMenuItems = this.value;
      $$invalidate(10, hideMenuItems);
    }
    $$self.$$set = ($$props2) => {
      if ("role" in $$props2)
        $$invalidate(0, role = $$props2.role);
      if ("onSave" in $$props2)
        $$invalidate(20, onSave = $$props2.onSave);
      if ("onClose" in $$props2)
        $$invalidate(1, onClose = $$props2.onClose);
    };
    $$self.$$.update = () => {
      if ($$self.$$.dirty[0] & /*role*/
      1) {
        $:
          if (role)
            loadRole();
      }
      if ($$self.$$.dirty[0] & /*permissions*/
      4) {
        $:
          $$invalidate(16, areReadOnly = permissions.includes("file:read") && !permissions.includes("*") && !permissions.includes("file:write") && !permissions.includes("file:create") && !permissions.includes("file:delete") && !permissions.includes("file:rename"));
      }
      if ($$self.$$.dirty[0] & /*permissions*/
      4) {
        $:
          $$invalidate(15, allSet = permissions.includes("*"));
      }
    };
    return [
      role,
      onClose,
      permissions,
      displayName,
      fileAccessType,
      fileAccessPaths,
      fileAccessTags,
      fileAccessExcludePaths,
      fileAccessExcludeTags,
      ribbonHiddenPluginIds,
      hideMenuItems,
      hideInaccessible,
      saving,
      error,
      activeSection,
      allSet,
      areReadOnly,
      togglePermission,
      handleSave,
      sections,
      onSave,
      input0_input_handler,
      change_handler,
      change_handler_1,
      click_handler,
      change_handler_2,
      change_handler_3,
      change_handler_4,
      change_handler_5,
      change_handler_6,
      change_handler_7,
      change_handler_8,
      change_handler_9,
      change_handler_10,
      select_change_handler,
      input0_input_handler_1,
      input1_input_handler,
      input2_input_handler,
      input3_input_handler,
      input4_change_handler,
      input3_input_handler_1,
      input4_input_handler
    ];
  }
  var RoleEditor = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance40, create_fragment40, safe_not_equal, { role: 0, onSave: 20, onClose: 1 }, add_css14, [-1, -1]);
    }
  };
  var RoleEditor_default = RoleEditor;

  // packages/ui/src/views/admin/AdminDashboard.svelte
  function add_css15(target) {
    append_styles(target, "svelte-dwpzwe", ".admin-layout.svelte-dwpzwe{display:flex;flex-direction:column;min-height:400px}.tab-bar.svelte-dwpzwe{display:flex;border-bottom:1px solid var(--background-modifier-border);padding:0 1.5rem;gap:0}.tab.svelte-dwpzwe{display:flex;align-items:center;gap:0.5rem;padding:0.75rem 1rem;background:none;border:none;border-bottom:2px solid transparent;color:var(--text-muted);font-size:0.875rem;cursor:pointer;transition:color 0.15s, border-color 0.15s}.tab.svelte-dwpzwe:hover{color:var(--text-normal)}.tab.active.svelte-dwpzwe{color:var(--interactive-accent);border-bottom-color:var(--interactive-accent)}.tab-content.svelte-dwpzwe{flex:1;padding:1.25rem 1.5rem;overflow-y:auto}.error.svelte-dwpzwe{color:var(--text-error);background:rgba(255, 0, 0, 0.1);padding:0.75rem;border-radius:6px;margin-bottom:1rem;font-size:0.875rem}.footer.svelte-dwpzwe{display:flex;justify-content:flex-end}");
  }
  function get_each_context7(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[21] = list[i];
    return child_ctx;
  }
  function create_each_block7(ctx) {
    let button;
    let switch_instance;
    let t0;
    let span;
    let t2;
    let current;
    let mounted;
    let dispose;
    var switch_value = (
      /*tab*/
      ctx[21].icon
    );
    function switch_props(ctx2, dirty) {
      return { props: { size: "1rem" } };
    }
    if (switch_value) {
      switch_instance = construct_svelte_component(switch_value, switch_props(ctx));
    }
    function click_handler_1() {
      return (
        /*click_handler_1*/
        ctx[11](
          /*tab*/
          ctx[21]
        )
      );
    }
    return {
      c() {
        button = element("button");
        if (switch_instance)
          create_component(switch_instance.$$.fragment);
        t0 = space();
        span = element("span");
        span.textContent = `${/*tab*/
        ctx[21].label}`;
        t2 = space();
        attr(button, "class", "tab svelte-dwpzwe");
        toggle_class(
          button,
          "active",
          /*activeTab*/
          ctx[1] === /*tab*/
          ctx[21].id
        );
      },
      m(target, anchor) {
        insert(target, button, anchor);
        if (switch_instance)
          mount_component(switch_instance, button, null);
        append(button, t0);
        append(button, span);
        append(button, t2);
        current = true;
        if (!mounted) {
          dispose = listen(button, "click", click_handler_1);
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (switch_value !== (switch_value = /*tab*/
        ctx[21].icon)) {
          if (switch_instance) {
            group_outros();
            const old_component = switch_instance;
            transition_out(old_component.$$.fragment, 1, 0, () => {
              destroy_component(old_component, 1);
            });
            check_outros();
          }
          if (switch_value) {
            switch_instance = construct_svelte_component(switch_value, switch_props(ctx, dirty));
            create_component(switch_instance.$$.fragment);
            transition_in(switch_instance.$$.fragment, 1);
            mount_component(switch_instance, button, t0);
          } else {
            switch_instance = null;
          }
        } else if (switch_value) {
        }
        if (!current || dirty & /*activeTab, tabs*/
        258) {
          toggle_class(
            button,
            "active",
            /*activeTab*/
            ctx[1] === /*tab*/
            ctx[21].id
          );
        }
      },
      i(local) {
        if (current)
          return;
        if (switch_instance)
          transition_in(switch_instance.$$.fragment, local);
        current = true;
      },
      o(local) {
        if (switch_instance)
          transition_out(switch_instance.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(button);
        }
        if (switch_instance)
          destroy_component(switch_instance);
        mounted = false;
        dispose();
      }
    };
  }
  function create_if_block_44(ctx) {
    let div;
    let t;
    return {
      c() {
        div = element("div");
        t = text(
          /*error*/
          ctx[7]
        );
        attr(div, "class", "error svelte-dwpzwe");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, t);
      },
      p(ctx2, dirty) {
        if (dirty & /*error*/
        128)
          set_data(
            t,
            /*error*/
            ctx2[7]
          );
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_if_block_36(ctx) {
    let vaultpermissions;
    let current;
    vaultpermissions = new VaultPermissions_default({
      props: {
        vaults: (
          /*vaults*/
          ctx[3]
        ),
        permissions: (
          /*permissions*/
          ctx[4]
        ),
        users: (
          /*users*/
          ctx[2]
        ),
        refresh: (
          /*refresh*/
          ctx[9]
        )
      }
    });
    return {
      c() {
        create_component(vaultpermissions.$$.fragment);
      },
      m(target, anchor) {
        mount_component(vaultpermissions, target, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        const vaultpermissions_changes = {};
        if (dirty & /*vaults*/
        8)
          vaultpermissions_changes.vaults = /*vaults*/
          ctx2[3];
        if (dirty & /*permissions*/
        16)
          vaultpermissions_changes.permissions = /*permissions*/
          ctx2[4];
        if (dirty & /*users*/
        4)
          vaultpermissions_changes.users = /*users*/
          ctx2[2];
        vaultpermissions.$set(vaultpermissions_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(vaultpermissions.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(vaultpermissions.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(vaultpermissions, detaching);
      }
    };
  }
  function create_if_block_17(ctx) {
    let t;
    let rolelist;
    let current;
    let if_block = (
      /*editingRole*/
      ctx[6] && create_if_block_26(ctx)
    );
    rolelist = new RoleList_default({
      props: {
        roles: (
          /*roles*/
          ctx[5]
        ),
        refresh: (
          /*refresh*/
          ctx[9]
        ),
        onEditRole: (
          /*func_2*/
          ctx[14]
        )
      }
    });
    return {
      c() {
        if (if_block)
          if_block.c();
        t = space();
        create_component(rolelist.$$.fragment);
      },
      m(target, anchor) {
        if (if_block)
          if_block.m(target, anchor);
        insert(target, t, anchor);
        mount_component(rolelist, target, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        if (
          /*editingRole*/
          ctx2[6]
        ) {
          if (if_block) {
            if_block.p(ctx2, dirty);
            if (dirty & /*editingRole*/
            64) {
              transition_in(if_block, 1);
            }
          } else {
            if_block = create_if_block_26(ctx2);
            if_block.c();
            transition_in(if_block, 1);
            if_block.m(t.parentNode, t);
          }
        } else if (if_block) {
          group_outros();
          transition_out(if_block, 1, 1, () => {
            if_block = null;
          });
          check_outros();
        }
        const rolelist_changes = {};
        if (dirty & /*roles*/
        32)
          rolelist_changes.roles = /*roles*/
          ctx2[5];
        if (dirty & /*editingRole*/
        64)
          rolelist_changes.onEditRole = /*func_2*/
          ctx2[14];
        rolelist.$set(rolelist_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(if_block);
        transition_in(rolelist.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(if_block);
        transition_out(rolelist.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
        if (if_block)
          if_block.d(detaching);
        destroy_component(rolelist, detaching);
      }
    };
  }
  function create_if_block11(ctx) {
    let userlist;
    let current;
    userlist = new UserList_default({
      props: {
        users: (
          /*users*/
          ctx[2]
        ),
        roles: (
          /*roles*/
          ctx[5]
        ),
        refresh: (
          /*refresh*/
          ctx[9]
        )
      }
    });
    return {
      c() {
        create_component(userlist.$$.fragment);
      },
      m(target, anchor) {
        mount_component(userlist, target, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        const userlist_changes = {};
        if (dirty & /*users*/
        4)
          userlist_changes.users = /*users*/
          ctx2[2];
        if (dirty & /*roles*/
        32)
          userlist_changes.roles = /*roles*/
          ctx2[5];
        userlist.$set(userlist_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(userlist.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(userlist.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(userlist, detaching);
      }
    };
  }
  function create_if_block_26(ctx) {
    let roleeditor;
    let current;
    roleeditor = new RoleEditor_default({
      props: {
        role: (
          /*editingRole*/
          ctx[6]
        ),
        onSave: (
          /*func*/
          ctx[12]
        ),
        onClose: (
          /*func_1*/
          ctx[13]
        )
      }
    });
    return {
      c() {
        create_component(roleeditor.$$.fragment);
      },
      m(target, anchor) {
        mount_component(roleeditor, target, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        const roleeditor_changes = {};
        if (dirty & /*editingRole*/
        64)
          roleeditor_changes.role = /*editingRole*/
          ctx2[6];
        if (dirty & /*editingRole*/
        64)
          roleeditor_changes.onSave = /*func*/
          ctx2[12];
        if (dirty & /*editingRole*/
        64)
          roleeditor_changes.onClose = /*func_1*/
          ctx2[13];
        roleeditor.$set(roleeditor_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(roleeditor.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(roleeditor.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(roleeditor, detaching);
      }
    };
  }
  function create_default_slot_18(ctx) {
    let div2;
    let div0;
    let t0;
    let div1;
    let t1;
    let current_block_type_index;
    let if_block1;
    let current;
    let each_value = ensure_array_like(
      /*tabs*/
      ctx[8]
    );
    let each_blocks = [];
    for (let i = 0; i < each_value.length; i += 1) {
      each_blocks[i] = create_each_block7(get_each_context7(ctx, each_value, i));
    }
    const out = (i) => transition_out(each_blocks[i], 1, 1, () => {
      each_blocks[i] = null;
    });
    let if_block0 = (
      /*error*/
      ctx[7] && create_if_block_44(ctx)
    );
    const if_block_creators = [create_if_block11, create_if_block_17, create_if_block_36];
    const if_blocks = [];
    function select_block_type(ctx2, dirty) {
      if (
        /*activeTab*/
        ctx2[1] === "users"
      )
        return 0;
      if (
        /*activeTab*/
        ctx2[1] === "roles"
      )
        return 1;
      if (
        /*activeTab*/
        ctx2[1] === "permissions"
      )
        return 2;
      return -1;
    }
    if (~(current_block_type_index = select_block_type(ctx, -1))) {
      if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    }
    return {
      c() {
        div2 = element("div");
        div0 = element("div");
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        t0 = space();
        div1 = element("div");
        if (if_block0)
          if_block0.c();
        t1 = space();
        if (if_block1)
          if_block1.c();
        attr(div0, "class", "tab-bar svelte-dwpzwe");
        attr(div1, "class", "tab-content svelte-dwpzwe");
        attr(div2, "class", "admin-layout svelte-dwpzwe");
      },
      m(target, anchor) {
        insert(target, div2, anchor);
        append(div2, div0);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(div0, null);
          }
        }
        append(div2, t0);
        append(div2, div1);
        if (if_block0)
          if_block0.m(div1, null);
        append(div1, t1);
        if (~current_block_type_index) {
          if_blocks[current_block_type_index].m(div1, null);
        }
        current = true;
      },
      p(ctx2, dirty) {
        if (dirty & /*activeTab, tabs*/
        258) {
          each_value = ensure_array_like(
            /*tabs*/
            ctx2[8]
          );
          let i;
          for (i = 0; i < each_value.length; i += 1) {
            const child_ctx = get_each_context7(ctx2, each_value, i);
            if (each_blocks[i]) {
              each_blocks[i].p(child_ctx, dirty);
              transition_in(each_blocks[i], 1);
            } else {
              each_blocks[i] = create_each_block7(child_ctx);
              each_blocks[i].c();
              transition_in(each_blocks[i], 1);
              each_blocks[i].m(div0, null);
            }
          }
          group_outros();
          for (i = each_value.length; i < each_blocks.length; i += 1) {
            out(i);
          }
          check_outros();
        }
        if (
          /*error*/
          ctx2[7]
        ) {
          if (if_block0) {
            if_block0.p(ctx2, dirty);
          } else {
            if_block0 = create_if_block_44(ctx2);
            if_block0.c();
            if_block0.m(div1, t1);
          }
        } else if (if_block0) {
          if_block0.d(1);
          if_block0 = null;
        }
        let previous_block_index = current_block_type_index;
        current_block_type_index = select_block_type(ctx2, dirty);
        if (current_block_type_index === previous_block_index) {
          if (~current_block_type_index) {
            if_blocks[current_block_type_index].p(ctx2, dirty);
          }
        } else {
          if (if_block1) {
            group_outros();
            transition_out(if_blocks[previous_block_index], 1, 1, () => {
              if_blocks[previous_block_index] = null;
            });
            check_outros();
          }
          if (~current_block_type_index) {
            if_block1 = if_blocks[current_block_type_index];
            if (!if_block1) {
              if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx2);
              if_block1.c();
            } else {
              if_block1.p(ctx2, dirty);
            }
            transition_in(if_block1, 1);
            if_block1.m(div1, null);
          } else {
            if_block1 = null;
          }
        }
      },
      i(local) {
        if (current)
          return;
        for (let i = 0; i < each_value.length; i += 1) {
          transition_in(each_blocks[i]);
        }
        transition_in(if_block1);
        current = true;
      },
      o(local) {
        each_blocks = each_blocks.filter(Boolean);
        for (let i = 0; i < each_blocks.length; i += 1) {
          transition_out(each_blocks[i]);
        }
        transition_out(if_block1);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div2);
        }
        destroy_each(each_blocks, detaching);
        if (if_block0)
          if_block0.d();
        if (~current_block_type_index) {
          if_blocks[current_block_type_index].d();
        }
      }
    };
  }
  function create_icon_slot8(ctx) {
    let settings;
    let current;
    settings = new settings_default({ props: { size: "1.25rem" } });
    return {
      c() {
        create_component(settings.$$.fragment);
      },
      m(target, anchor) {
        mount_component(settings, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(settings.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(settings.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(settings, detaching);
      }
    };
  }
  function create_default_slot34(ctx) {
    let t;
    return {
      c() {
        t = text("Close");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_footer_slot4(ctx) {
    let div;
    let button;
    let current;
    button = new Button_default({
      props: {
        variant: "ghost",
        $$slots: { default: [create_default_slot34] },
        $$scope: { ctx }
      }
    });
    button.$on(
      "click",
      /*click_handler*/
      ctx[10]
    );
    return {
      c() {
        div = element("div");
        create_component(button.$$.fragment);
        attr(div, "class", "footer svelte-dwpzwe");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        mount_component(button, div, null);
        current = true;
      },
      p(ctx2, dirty) {
        const button_changes = {};
        if (dirty & /*$$scope*/
        16777216) {
          button_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button.$set(button_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(button.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(button.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        destroy_component(button);
      }
    };
  }
  function create_fragment41(ctx) {
    let modal;
    let current;
    let modal_props = {
      title: "Admin Dashboard",
      width: "780px",
      closeOnOverlayClick: false,
      $$slots: {
        footer: [create_footer_slot4],
        icon: [create_icon_slot8],
        default: [create_default_slot_18]
      },
      $$scope: { ctx }
    };
    modal = new Modal_default({ props: modal_props });
    ctx[15](modal);
    modal.$on("escape", function() {
      if (is_function(
        /*editingRole*/
        ctx[6] ? (
          /*escape_handler*/
          ctx[16]
        ) : void 0
      ))
        /*editingRole*/
        (ctx[6] ? (
          /*escape_handler*/
          ctx[16]
        ) : void 0).apply(this, arguments);
    });
    return {
      c() {
        create_component(modal.$$.fragment);
      },
      m(target, anchor) {
        mount_component(modal, target, anchor);
        current = true;
      },
      p(new_ctx, [dirty]) {
        ctx = new_ctx;
        const modal_changes = {};
        if (dirty & /*$$scope, modalRef, users, roles, activeTab, editingRole, vaults, permissions, error*/
        16777471) {
          modal_changes.$$scope = { dirty, ctx };
        }
        modal.$set(modal_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(modal.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(modal.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        ctx[15](null);
        destroy_component(modal, detaching);
      }
    };
  }
  function instance41($$self, $$props, $$invalidate) {
    let modalRef;
    let activeTab = "users";
    let users = [];
    let vaults = [];
    let permissions = {};
    let roles = [];
    let editingRole = null;
    let error = "";
    const tabs = [
      { id: "users", label: "Users", icon: users_default },
      {
        id: "roles",
        label: "Roles",
        icon: shield_default
      },
      {
        id: "permissions",
        label: "Vault Access",
        icon: list_checks_default
      }
    ];
    async function fetchUsers() {
      try {
        const res = await fetch("/api/admin/users");
        if (!res.ok)
          throw new Error("Failed to fetch users");
        $$invalidate(2, users = await res.json());
      } catch (e) {
        $$invalidate(7, error = e.message);
      }
    }
    async function fetchVaults() {
      try {
        const res = await fetch("/api/vault/list");
        if (!res.ok)
          throw new Error("Failed to fetch vaults");
        $$invalidate(3, vaults = await res.json());
      } catch (e) {
        $$invalidate(7, error = e.message);
      }
    }
    async function fetchPermissions() {
      try {
        const res = await fetch("/api/admin/permissions");
        if (!res.ok)
          throw new Error("Failed to fetch permissions");
        $$invalidate(4, permissions = await res.json());
      } catch (e) {
        $$invalidate(7, error = e.message);
      }
    }
    async function fetchRoles() {
      try {
        const res = await fetch("/api/admin/roles");
        if (!res.ok)
          throw new Error("Failed to fetch roles");
        $$invalidate(5, roles = await res.json());
      } catch (e) {
        $$invalidate(7, error = e.message);
      }
    }
    async function refresh() {
      await Promise.all([fetchUsers(), fetchVaults(), fetchPermissions(), fetchRoles()]);
    }
    onMount(refresh);
    const click_handler = () => modalRef.dismiss();
    const click_handler_1 = (tab) => $$invalidate(1, activeTab = tab.id);
    const func = () => {
      $$invalidate(6, editingRole = null);
      refresh();
    };
    const func_1 = () => $$invalidate(6, editingRole = null);
    const func_2 = (r) => $$invalidate(6, editingRole = r);
    function modal_binding($$value) {
      binding_callbacks[$$value ? "unshift" : "push"](() => {
        modalRef = $$value;
        $$invalidate(0, modalRef);
      });
    }
    const escape_handler = () => $$invalidate(6, editingRole = null);
    return [
      modalRef,
      activeTab,
      users,
      vaults,
      permissions,
      roles,
      editingRole,
      error,
      tabs,
      refresh,
      click_handler,
      click_handler_1,
      func,
      func_1,
      func_2,
      modal_binding,
      escape_handler
    ];
  }
  var AdminDashboard = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance41, create_fragment41, safe_not_equal, {}, add_css15);
    }
  };
  var AdminDashboard_default = AdminDashboard;

  // packages/ui/src/views/VaultManager.svelte
  function add_css16(target) {
    append_styles(target, "svelte-of6ag7", ".section-header.svelte-of6ag7.svelte-of6ag7{display:flex;align-items:center;justify-content:space-between;padding:0.5rem 2rem 0rem 1.5rem;flex-shrink:0}.section-header.svelte-of6ag7 h3.svelte-of6ag7{margin:0;font-size:1.25rem;font-weight:700;color:var(--text-normal)}.search-wrapper.svelte-of6ag7.svelte-of6ag7{width:11rem}.section-body.svelte-of6ag7.svelte-of6ag7{flex:1;display:flex;flex-direction:column;padding:1rem 1.1rem 0rem 1rem}.vault-list.svelte-of6ag7.svelte-of6ag7{flex:1;overflow-y:auto;scrollbar-gutter:stable;min-height:300px;max-height:300px;padding:0rem 0 1rem 0;display:flex;flex-direction:column;gap:0.375rem;border-bottom:1px solid var(--background-modifier-border)}.empty.svelte-of6ag7.svelte-of6ag7{color:var(--text-muted);padding:2rem 1rem;text-align:center;font-size:0.875rem}.vault-name.svelte-of6ag7.svelte-of6ag7{font-weight:600;font-size:1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.active-label.svelte-of6ag7.svelte-of6ag7{color:var(--interactive-accent);font-weight:400;font-size:0.875rem;margin-left:0.375rem}.active-check.svelte-of6ag7.svelte-of6ag7{color:var(--interactive-accent);font-size:0.875rem;margin-left:0.125rem}.vault-path.svelte-of6ag7.svelte-of6ag7{font-size:0.8125rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.footer-left.svelte-of6ag7.svelte-of6ag7{display:flex;align-items:center}.footer-right.svelte-of6ag7.svelte-of6ag7{display:flex;justify-content:flex-end}.version-info.svelte-of6ag7.svelte-of6ag7{font-size:0.75rem;color:var(--text-muted);user-select:none}");
  }
  function get_each_context8(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[40] = list[i];
    return child_ctx;
  }
  function create_else_block4(ctx) {
    let each_blocks = [];
    let each_1_lookup = /* @__PURE__ */ new Map();
    let each_1_anchor;
    let current;
    let each_value = ensure_array_like(
      /*filteredVaults*/
      ctx[11]
    );
    const get_key = (ctx2) => (
      /*vault*/
      ctx2[40].id
    );
    for (let i = 0; i < each_value.length; i += 1) {
      let child_ctx = get_each_context8(ctx, each_value, i);
      let key = get_key(child_ctx);
      each_1_lookup.set(key, each_blocks[i] = create_each_block8(key, child_ctx));
    }
    return {
      c() {
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        each_1_anchor = empty();
      },
      m(target, anchor) {
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(target, anchor);
          }
        }
        insert(target, each_1_anchor, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*filteredVaults, currentVaultId, openVault, openMenuId, menuItems, toggleMenu, onMenuSelect*/
        125968) {
          each_value = ensure_array_like(
            /*filteredVaults*/
            ctx2[11]
          );
          group_outros();
          each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx2, each_value, each_1_lookup, each_1_anchor.parentNode, outro_and_destroy_block, create_each_block8, each_1_anchor, get_each_context8);
          check_outros();
        }
      },
      i(local) {
        if (current)
          return;
        for (let i = 0; i < each_value.length; i += 1) {
          transition_in(each_blocks[i]);
        }
        current = true;
      },
      o(local) {
        for (let i = 0; i < each_blocks.length; i += 1) {
          transition_out(each_blocks[i]);
        }
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(each_1_anchor);
        }
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].d(detaching);
        }
      }
    };
  }
  function create_if_block_73(ctx) {
    let div;
    return {
      c() {
        div = element("div");
        div.textContent = "No vaults match your search.";
        attr(div, "class", "empty svelte-of6ag7");
      },
      m(target, anchor) {
        insert(target, div, anchor);
      },
      p: noop,
      i: noop,
      o: noop,
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_if_block_63(ctx) {
    let div;
    return {
      c() {
        div = element("div");
        div.textContent = "No vaults yet. Create one below.";
        attr(div, "class", "empty svelte-of6ag7");
      },
      m(target, anchor) {
        insert(target, div, anchor);
      },
      p: noop,
      i: noop,
      o: noop,
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_icon_slot_6(ctx) {
    let folder;
    let t;
    let current;
    folder = new folder_default({ props: { size: "1.5rem" } });
    return {
      c() {
        create_component(folder.$$.fragment);
        t = space();
      },
      m(target, anchor) {
        mount_component(folder, target, anchor);
        insert(target, t, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(folder.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(folder.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
        destroy_component(folder, detaching);
      }
    };
  }
  function create_if_block_83(ctx) {
    let span0;
    let t1;
    let span1;
    return {
      c() {
        span0 = element("span");
        span0.textContent = "(active)";
        t1 = space();
        span1 = element("span");
        span1.textContent = "\u2713";
        attr(span0, "class", "active-label svelte-of6ag7");
        attr(span1, "class", "active-check svelte-of6ag7");
      },
      m(target, anchor) {
        insert(target, span0, anchor);
        insert(target, t1, anchor);
        insert(target, span1, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(span0);
          detach(t1);
          detach(span1);
        }
      }
    };
  }
  function create_default_slot_33(ctx) {
    let span0;
    let t0_value = (
      /*vault*/
      ctx[40].name + ""
    );
    let t0;
    let t1;
    let t2;
    let span1;
    let t3_value = (
      /*vault*/
      ctx[40].path + ""
    );
    let t3;
    let t4;
    let if_block = (
      /*vault*/
      ctx[40].id === /*currentVaultId*/
      ctx[10] && create_if_block_83(ctx)
    );
    return {
      c() {
        span0 = element("span");
        t0 = text(t0_value);
        t1 = space();
        if (if_block)
          if_block.c();
        t2 = space();
        span1 = element("span");
        t3 = text(t3_value);
        t4 = space();
        attr(span0, "class", "vault-name svelte-of6ag7");
        attr(span1, "class", "vault-path svelte-of6ag7");
      },
      m(target, anchor) {
        insert(target, span0, anchor);
        append(span0, t0);
        append(span0, t1);
        if (if_block)
          if_block.m(span0, null);
        insert(target, t2, anchor);
        insert(target, span1, anchor);
        append(span1, t3);
        insert(target, t4, anchor);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*filteredVaults*/
        2048 && t0_value !== (t0_value = /*vault*/
        ctx2[40].name + ""))
          set_data(t0, t0_value);
        if (
          /*vault*/
          ctx2[40].id === /*currentVaultId*/
          ctx2[10]
        ) {
          if (if_block) {
          } else {
            if_block = create_if_block_83(ctx2);
            if_block.c();
            if_block.m(span0, null);
          }
        } else if (if_block) {
          if_block.d(1);
          if_block = null;
        }
        if (dirty[0] & /*filteredVaults*/
        2048 && t3_value !== (t3_value = /*vault*/
        ctx2[40].path + ""))
          set_data(t3, t3_value);
      },
      d(detaching) {
        if (detaching) {
          detach(span0);
          detach(t2);
          detach(span1);
          detach(t4);
        }
        if (if_block)
          if_block.d();
      }
    };
  }
  function create_action_slot(ctx) {
    let popovermenu;
    let t;
    let current;
    function toggle_handler() {
      return (
        /*toggle_handler*/
        ctx[28](
          /*vault*/
          ctx[40]
        )
      );
    }
    function select_handler(...args) {
      return (
        /*select_handler*/
        ctx[29](
          /*vault*/
          ctx[40],
          ...args
        )
      );
    }
    popovermenu = new PopoverMenu_default({
      props: {
        open: (
          /*openMenuId*/
          ctx[4] === /*vault*/
          ctx[40].id
        ),
        items: (
          /*menuItems*/
          ctx[13]
        )
      }
    });
    popovermenu.$on("toggle", toggle_handler);
    popovermenu.$on("select", select_handler);
    return {
      c() {
        create_component(popovermenu.$$.fragment);
        t = space();
      },
      m(target, anchor) {
        mount_component(popovermenu, target, anchor);
        insert(target, t, anchor);
        current = true;
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        const popovermenu_changes = {};
        if (dirty[0] & /*openMenuId, filteredVaults*/
        2064)
          popovermenu_changes.open = /*openMenuId*/
          ctx[4] === /*vault*/
          ctx[40].id;
        popovermenu.$set(popovermenu_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(popovermenu.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(popovermenu.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
        destroy_component(popovermenu, detaching);
      }
    };
  }
  function create_each_block8(key_1, ctx) {
    let first;
    let listitem;
    let current;
    function click_handler() {
      return (
        /*click_handler*/
        ctx[30](
          /*vault*/
          ctx[40]
        )
      );
    }
    listitem = new ListItem_default({
      props: {
        primary: (
          /*vault*/
          ctx[40].name
        ),
        secondary: (
          /*vault*/
          ctx[40].path
        ),
        active: (
          /*vault*/
          ctx[40].id === /*currentVaultId*/
          ctx[10]
        ),
        $$slots: {
          action: [create_action_slot],
          default: [create_default_slot_33],
          icon: [create_icon_slot_6]
        },
        $$scope: { ctx }
      }
    });
    listitem.$on("click", click_handler);
    return {
      key: key_1,
      first: null,
      c() {
        first = empty();
        create_component(listitem.$$.fragment);
        this.first = first;
      },
      m(target, anchor) {
        insert(target, first, anchor);
        mount_component(listitem, target, anchor);
        current = true;
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        const listitem_changes = {};
        if (dirty[0] & /*filteredVaults*/
        2048)
          listitem_changes.primary = /*vault*/
          ctx[40].name;
        if (dirty[0] & /*filteredVaults*/
        2048)
          listitem_changes.secondary = /*vault*/
          ctx[40].path;
        if (dirty[0] & /*filteredVaults, currentVaultId*/
        3072)
          listitem_changes.active = /*vault*/
          ctx[40].id === /*currentVaultId*/
          ctx[10];
        if (dirty[0] & /*openMenuId, filteredVaults, currentVaultId*/
        3088 | dirty[1] & /*$$scope*/
        4096) {
          listitem_changes.$$scope = { dirty, ctx };
        }
        listitem.$set(listitem_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(listitem.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(listitem.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(first);
        }
        destroy_component(listitem, detaching);
      }
    };
  }
  function create_default_slot_26(ctx) {
    let div1;
    let h3;
    let t1;
    let div0;
    let searchinput;
    let t2;
    let div3;
    let div2;
    let current_block_type_index;
    let if_block;
    let current;
    searchinput = new SearchInput_default({ props: { value: (
      /*searchQuery*/
      ctx[1]
    ) } });
    searchinput.$on(
      "input",
      /*input_handler*/
      ctx[27]
    );
    const if_block_creators = [create_if_block_63, create_if_block_73, create_else_block4];
    const if_blocks = [];
    function select_block_type(ctx2, dirty) {
      if (
        /*vaults*/
        ctx2[0].length === 0
      )
        return 0;
      if (
        /*filteredVaults*/
        ctx2[11].length === 0
      )
        return 1;
      return 2;
    }
    current_block_type_index = select_block_type(ctx, [-1, -1]);
    if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    return {
      c() {
        div1 = element("div");
        h3 = element("h3");
        h3.textContent = "Vaults";
        t1 = space();
        div0 = element("div");
        create_component(searchinput.$$.fragment);
        t2 = space();
        div3 = element("div");
        div2 = element("div");
        if_block.c();
        attr(h3, "class", "svelte-of6ag7");
        attr(div0, "class", "search-wrapper svelte-of6ag7");
        attr(div1, "class", "section-header svelte-of6ag7");
        attr(div2, "class", "vault-list svelte-of6ag7");
        attr(div3, "class", "section-body svelte-of6ag7");
      },
      m(target, anchor) {
        insert(target, div1, anchor);
        append(div1, h3);
        append(div1, t1);
        append(div1, div0);
        mount_component(searchinput, div0, null);
        insert(target, t2, anchor);
        insert(target, div3, anchor);
        append(div3, div2);
        if_blocks[current_block_type_index].m(div2, null);
        current = true;
      },
      p(ctx2, dirty) {
        const searchinput_changes = {};
        if (dirty[0] & /*searchQuery*/
        2)
          searchinput_changes.value = /*searchQuery*/
          ctx2[1];
        searchinput.$set(searchinput_changes);
        let previous_block_index = current_block_type_index;
        current_block_type_index = select_block_type(ctx2, dirty);
        if (current_block_type_index === previous_block_index) {
          if_blocks[current_block_type_index].p(ctx2, dirty);
        } else {
          group_outros();
          transition_out(if_blocks[previous_block_index], 1, 1, () => {
            if_blocks[previous_block_index] = null;
          });
          check_outros();
          if_block = if_blocks[current_block_type_index];
          if (!if_block) {
            if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx2);
            if_block.c();
          } else {
            if_block.p(ctx2, dirty);
          }
          transition_in(if_block, 1);
          if_block.m(div2, null);
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(searchinput.$$.fragment, local);
        transition_in(if_block);
        current = true;
      },
      o(local) {
        transition_out(searchinput.$$.fragment, local);
        transition_out(if_block);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div1);
          detach(t2);
          detach(div3);
        }
        destroy_component(searchinput);
        if_blocks[current_block_type_index].d();
      }
    };
  }
  function create_icon_slot_52(ctx) {
    let vault_1;
    let current;
    vault_1 = new vault_default({ props: { size: "1.25rem" } });
    return {
      c() {
        create_component(vault_1.$$.fragment);
      },
      m(target, anchor) {
        mount_component(vault_1, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(vault_1.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(vault_1.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(vault_1, detaching);
      }
    };
  }
  function create_if_block_53(ctx) {
    let span;
    let t0;
    let t1;
    return {
      c() {
        span = element("span");
        t0 = text("Ignis v");
        t1 = text(
          /*version*/
          ctx[9]
        );
        attr(span, "class", "version-info svelte-of6ag7");
      },
      m(target, anchor) {
        insert(target, span, anchor);
        append(span, t0);
        append(span, t1);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*version*/
        512)
          set_data(
            t1,
            /*version*/
            ctx2[9]
          );
      },
      d(detaching) {
        if (detaching) {
          detach(span);
        }
      }
    };
  }
  function create_if_block_45(ctx) {
    let button;
    let current;
    button = new Button_default({
      props: {
        variant: "ghost",
        $$slots: {
          icon: [create_icon_slot_42],
          default: [create_default_slot_19]
        },
        $$scope: { ctx }
      }
    });
    button.$on(
      "click",
      /*showAdmin*/
      ctx[24]
    );
    return {
      c() {
        create_component(button.$$.fragment);
      },
      m(target, anchor) {
        mount_component(button, target, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        const button_changes = {};
        if (dirty[1] & /*$$scope*/
        4096) {
          button_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button.$set(button_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(button.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(button.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(button, detaching);
      }
    };
  }
  function create_default_slot_19(ctx) {
    let t;
    return {
      c() {
        t = text("Admin");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_icon_slot_42(ctx) {
    let settings;
    let current;
    settings = new settings_default({ props: { size: "1rem" } });
    return {
      c() {
        create_component(settings.$$.fragment);
      },
      m(target, anchor) {
        mount_component(settings, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(settings.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(settings.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(settings, detaching);
      }
    };
  }
  function create_default_slot35(ctx) {
    let t;
    return {
      c() {
        t = text("Create New Vault");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_icon_slot_33(ctx) {
    let plus;
    let current;
    plus = new plus_default({ props: { size: "1rem" } });
    return {
      c() {
        create_component(plus.$$.fragment);
      },
      m(target, anchor) {
        mount_component(plus, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(plus.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(plus.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(plus, detaching);
      }
    };
  }
  function create_footer_slot5(ctx) {
    let div0;
    let t0;
    let t1;
    let div1;
    let button;
    let current;
    let if_block0 = (
      /*version*/
      ctx[9] && create_if_block_53(ctx)
    );
    let if_block1 = (
      /*isAdmin*/
      ctx[3] && create_if_block_45(ctx)
    );
    button = new Button_default({
      props: {
        variant: "ghost",
        $$slots: {
          icon: [create_icon_slot_33],
          default: [create_default_slot35]
        },
        $$scope: { ctx }
      }
    });
    button.$on(
      "click",
      /*showCreateDialog*/
      ctx[17]
    );
    return {
      c() {
        div0 = element("div");
        if (if_block0)
          if_block0.c();
        t0 = space();
        if (if_block1)
          if_block1.c();
        t1 = space();
        div1 = element("div");
        create_component(button.$$.fragment);
        attr(div0, "class", "footer-left svelte-of6ag7");
        attr(div1, "class", "footer-right svelte-of6ag7");
      },
      m(target, anchor) {
        insert(target, div0, anchor);
        if (if_block0)
          if_block0.m(div0, null);
        append(div0, t0);
        if (if_block1)
          if_block1.m(div0, null);
        insert(target, t1, anchor);
        insert(target, div1, anchor);
        mount_component(button, div1, null);
        current = true;
      },
      p(ctx2, dirty) {
        if (
          /*version*/
          ctx2[9]
        ) {
          if (if_block0) {
            if_block0.p(ctx2, dirty);
          } else {
            if_block0 = create_if_block_53(ctx2);
            if_block0.c();
            if_block0.m(div0, t0);
          }
        } else if (if_block0) {
          if_block0.d(1);
          if_block0 = null;
        }
        if (
          /*isAdmin*/
          ctx2[3]
        ) {
          if (if_block1) {
            if_block1.p(ctx2, dirty);
            if (dirty[0] & /*isAdmin*/
            8) {
              transition_in(if_block1, 1);
            }
          } else {
            if_block1 = create_if_block_45(ctx2);
            if_block1.c();
            transition_in(if_block1, 1);
            if_block1.m(div0, null);
          }
        } else if (if_block1) {
          group_outros();
          transition_out(if_block1, 1, 1, () => {
            if_block1 = null;
          });
          check_outros();
        }
        const button_changes = {};
        if (dirty[1] & /*$$scope*/
        4096) {
          button_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button.$set(button_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(if_block1);
        transition_in(button.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(if_block1);
        transition_out(button.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div0);
          detach(t1);
          detach(div1);
        }
        if (if_block0)
          if_block0.d();
        if (if_block1)
          if_block1.d();
        destroy_component(button);
      }
    };
  }
  function create_if_block_37(ctx) {
    let promptdialog;
    let updating_value;
    let current;
    function promptdialog_value_binding(value) {
      ctx[32](value);
    }
    let promptdialog_props = {
      title: "Create Vault",
      label: "Vault Name:",
      placeholder: "My New Vault",
      confirmText: "Create Vault",
      $$slots: {
        confirmIcon: [create_confirmIcon_slot_2],
        icon: [create_icon_slot_23]
      },
      $$scope: { ctx }
    };
    if (
      /*dialogValue*/
      ctx[7] !== void 0
    ) {
      promptdialog_props.value = /*dialogValue*/
      ctx[7];
    }
    promptdialog = new PromptDialog_default({ props: promptdialog_props });
    binding_callbacks.push(() => bind(promptdialog, "value", promptdialog_value_binding));
    promptdialog.$on(
      "confirm",
      /*onCreateConfirm*/
      ctx[19]
    );
    promptdialog.$on(
      "cancel",
      /*closeDialog*/
      ctx[18]
    );
    return {
      c() {
        create_component(promptdialog.$$.fragment);
      },
      m(target, anchor) {
        mount_component(promptdialog, target, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        const promptdialog_changes = {};
        if (dirty[1] & /*$$scope*/
        4096) {
          promptdialog_changes.$$scope = { dirty, ctx: ctx2 };
        }
        if (!updating_value && dirty[0] & /*dialogValue*/
        128) {
          updating_value = true;
          promptdialog_changes.value = /*dialogValue*/
          ctx2[7];
          add_flush_callback(() => updating_value = false);
        }
        promptdialog.$set(promptdialog_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(promptdialog.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(promptdialog.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(promptdialog, detaching);
      }
    };
  }
  function create_icon_slot_23(ctx) {
    let squareplus;
    let current;
    squareplus = new square_plus_default({ props: { size: "1.25rem" } });
    return {
      c() {
        create_component(squareplus.$$.fragment);
      },
      m(target, anchor) {
        mount_component(squareplus, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(squareplus.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(squareplus.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(squareplus, detaching);
      }
    };
  }
  function create_confirmIcon_slot_2(ctx) {
    let plus;
    let current;
    plus = new plus_default({ props: { size: "0.875rem" } });
    return {
      c() {
        create_component(plus.$$.fragment);
      },
      m(target, anchor) {
        mount_component(plus, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(plus.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(plus.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(plus, detaching);
      }
    };
  }
  function create_if_block_27(ctx) {
    let promptdialog;
    let updating_value;
    let current;
    function promptdialog_value_binding_1(value) {
      ctx[33](value);
    }
    let promptdialog_props = {
      title: "Rename Item",
      label: "New Name:",
      confirmText: "Save",
      $$slots: {
        confirmIcon: [create_confirmIcon_slot_1],
        icon: [create_icon_slot_17]
      },
      $$scope: { ctx }
    };
    if (
      /*dialogValue*/
      ctx[7] !== void 0
    ) {
      promptdialog_props.value = /*dialogValue*/
      ctx[7];
    }
    promptdialog = new PromptDialog_default({ props: promptdialog_props });
    binding_callbacks.push(() => bind(promptdialog, "value", promptdialog_value_binding_1));
    promptdialog.$on(
      "confirm",
      /*onRenameConfirm*/
      ctx[20]
    );
    promptdialog.$on(
      "cancel",
      /*closeDialog*/
      ctx[18]
    );
    return {
      c() {
        create_component(promptdialog.$$.fragment);
      },
      m(target, anchor) {
        mount_component(promptdialog, target, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        const promptdialog_changes = {};
        if (dirty[1] & /*$$scope*/
        4096) {
          promptdialog_changes.$$scope = { dirty, ctx: ctx2 };
        }
        if (!updating_value && dirty[0] & /*dialogValue*/
        128) {
          updating_value = true;
          promptdialog_changes.value = /*dialogValue*/
          ctx2[7];
          add_flush_callback(() => updating_value = false);
        }
        promptdialog.$set(promptdialog_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(promptdialog.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(promptdialog.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(promptdialog, detaching);
      }
    };
  }
  function create_icon_slot_17(ctx) {
    let penline;
    let current;
    penline = new pen_line_default({ props: { size: "1.25rem" } });
    return {
      c() {
        create_component(penline.$$.fragment);
      },
      m(target, anchor) {
        mount_component(penline, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(penline.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(penline.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(penline, detaching);
      }
    };
  }
  function create_confirmIcon_slot_1(ctx) {
    let check;
    let current;
    check = new check_default({ props: { size: "0.875rem" } });
    return {
      c() {
        create_component(check.$$.fragment);
      },
      m(target, anchor) {
        mount_component(check, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(check.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(check.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(check, detaching);
      }
    };
  }
  function create_if_block_18(ctx) {
    let confirmdialog;
    let current;
    confirmdialog = new ConfirmDialog_default({
      props: {
        title: "Delete Confirmation",
        message: (
          /*deleteMessage*/
          ctx[12]
        ),
        description: "This action cannot be undone. All notes and linked files within this vault will be permanently removed from your system.",
        confirmText: "Confirm Delete",
        confirmVariant: "danger",
        $$slots: {
          confirmIcon: [create_confirmIcon_slot],
          icon: [create_icon_slot9]
        },
        $$scope: { ctx }
      }
    });
    confirmdialog.$on(
      "confirm",
      /*onDeleteConfirm*/
      ctx[21]
    );
    confirmdialog.$on(
      "cancel",
      /*closeDialog*/
      ctx[18]
    );
    return {
      c() {
        create_component(confirmdialog.$$.fragment);
      },
      m(target, anchor) {
        mount_component(confirmdialog, target, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        const confirmdialog_changes = {};
        if (dirty[0] & /*deleteMessage*/
        4096)
          confirmdialog_changes.message = /*deleteMessage*/
          ctx2[12];
        if (dirty[1] & /*$$scope*/
        4096) {
          confirmdialog_changes.$$scope = { dirty, ctx: ctx2 };
        }
        confirmdialog.$set(confirmdialog_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(confirmdialog.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(confirmdialog.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(confirmdialog, detaching);
      }
    };
  }
  function create_icon_slot9(ctx) {
    let trash2;
    let current;
    trash2 = new trash_2_default({ props: { size: "1.25rem" } });
    return {
      c() {
        create_component(trash2.$$.fragment);
      },
      m(target, anchor) {
        mount_component(trash2, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(trash2.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(trash2.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(trash2, detaching);
      }
    };
  }
  function create_confirmIcon_slot(ctx) {
    let check;
    let current;
    check = new check_default({ props: { size: "0.875rem" } });
    return {
      c() {
        create_component(check.$$.fragment);
      },
      m(target, anchor) {
        mount_component(check, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(check.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(check.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(check, detaching);
      }
    };
  }
  function create_if_block12(ctx) {
    let messagedialog;
    let current;
    messagedialog = new MessageDialog_default({
      props: {
        title: "Error",
        message: (
          /*errorMessage*/
          ctx[8]
        )
      }
    });
    messagedialog.$on(
      "confirm",
      /*confirm_handler*/
      ctx[34]
    );
    return {
      c() {
        create_component(messagedialog.$$.fragment);
      },
      m(target, anchor) {
        mount_component(messagedialog, target, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        const messagedialog_changes = {};
        if (dirty[0] & /*errorMessage*/
        256)
          messagedialog_changes.message = /*errorMessage*/
          ctx2[8];
        messagedialog.$set(messagedialog_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(messagedialog.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(messagedialog.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(messagedialog, detaching);
      }
    };
  }
  function create_fragment42(ctx) {
    let modal;
    let t0;
    let t1;
    let t2;
    let t3;
    let if_block3_anchor;
    let current;
    let modal_props = {
      title: "Vault Manager",
      width: "600px",
      closeOnOverlayClick: false,
      $$slots: {
        footer: [create_footer_slot5],
        icon: [create_icon_slot_52],
        default: [create_default_slot_26]
      },
      $$scope: { ctx }
    };
    modal = new Modal_default({ props: modal_props });
    ctx[31](modal);
    modal.$on(
      "escape",
      /*onEscape*/
      ctx[23]
    );
    modal.$on(
      "close",
      /*onModalClose*/
      ctx[22]
    );
    let if_block0 = (
      /*activeDialog*/
      ctx[6] === "create" && create_if_block_37(ctx)
    );
    let if_block1 = (
      /*activeDialog*/
      ctx[6] === "rename" && create_if_block_27(ctx)
    );
    let if_block2 = (
      /*activeDialog*/
      ctx[6] === "delete" && /*targetVault*/
      ctx[2] && create_if_block_18(ctx)
    );
    let if_block3 = (
      /*activeDialog*/
      ctx[6] === "error" && create_if_block12(ctx)
    );
    return {
      c() {
        create_component(modal.$$.fragment);
        t0 = space();
        if (if_block0)
          if_block0.c();
        t1 = space();
        if (if_block1)
          if_block1.c();
        t2 = space();
        if (if_block2)
          if_block2.c();
        t3 = space();
        if (if_block3)
          if_block3.c();
        if_block3_anchor = empty();
      },
      m(target, anchor) {
        mount_component(modal, target, anchor);
        insert(target, t0, anchor);
        if (if_block0)
          if_block0.m(target, anchor);
        insert(target, t1, anchor);
        if (if_block1)
          if_block1.m(target, anchor);
        insert(target, t2, anchor);
        if (if_block2)
          if_block2.m(target, anchor);
        insert(target, t3, anchor);
        if (if_block3)
          if_block3.m(target, anchor);
        insert(target, if_block3_anchor, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        const modal_changes = {};
        if (dirty[0] & /*isAdmin, version, vaults, filteredVaults, currentVaultId, openMenuId, searchQuery*/
        3611 | dirty[1] & /*$$scope*/
        4096) {
          modal_changes.$$scope = { dirty, ctx: ctx2 };
        }
        modal.$set(modal_changes);
        if (
          /*activeDialog*/
          ctx2[6] === "create"
        ) {
          if (if_block0) {
            if_block0.p(ctx2, dirty);
            if (dirty[0] & /*activeDialog*/
            64) {
              transition_in(if_block0, 1);
            }
          } else {
            if_block0 = create_if_block_37(ctx2);
            if_block0.c();
            transition_in(if_block0, 1);
            if_block0.m(t1.parentNode, t1);
          }
        } else if (if_block0) {
          group_outros();
          transition_out(if_block0, 1, 1, () => {
            if_block0 = null;
          });
          check_outros();
        }
        if (
          /*activeDialog*/
          ctx2[6] === "rename"
        ) {
          if (if_block1) {
            if_block1.p(ctx2, dirty);
            if (dirty[0] & /*activeDialog*/
            64) {
              transition_in(if_block1, 1);
            }
          } else {
            if_block1 = create_if_block_27(ctx2);
            if_block1.c();
            transition_in(if_block1, 1);
            if_block1.m(t2.parentNode, t2);
          }
        } else if (if_block1) {
          group_outros();
          transition_out(if_block1, 1, 1, () => {
            if_block1 = null;
          });
          check_outros();
        }
        if (
          /*activeDialog*/
          ctx2[6] === "delete" && /*targetVault*/
          ctx2[2]
        ) {
          if (if_block2) {
            if_block2.p(ctx2, dirty);
            if (dirty[0] & /*activeDialog, targetVault*/
            68) {
              transition_in(if_block2, 1);
            }
          } else {
            if_block2 = create_if_block_18(ctx2);
            if_block2.c();
            transition_in(if_block2, 1);
            if_block2.m(t3.parentNode, t3);
          }
        } else if (if_block2) {
          group_outros();
          transition_out(if_block2, 1, 1, () => {
            if_block2 = null;
          });
          check_outros();
        }
        if (
          /*activeDialog*/
          ctx2[6] === "error"
        ) {
          if (if_block3) {
            if_block3.p(ctx2, dirty);
            if (dirty[0] & /*activeDialog*/
            64) {
              transition_in(if_block3, 1);
            }
          } else {
            if_block3 = create_if_block12(ctx2);
            if_block3.c();
            transition_in(if_block3, 1);
            if_block3.m(if_block3_anchor.parentNode, if_block3_anchor);
          }
        } else if (if_block3) {
          group_outros();
          transition_out(if_block3, 1, 1, () => {
            if_block3 = null;
          });
          check_outros();
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(modal.$$.fragment, local);
        transition_in(if_block0);
        transition_in(if_block1);
        transition_in(if_block2);
        transition_in(if_block3);
        current = true;
      },
      o(local) {
        transition_out(modal.$$.fragment, local);
        transition_out(if_block0);
        transition_out(if_block1);
        transition_out(if_block2);
        transition_out(if_block3);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(t0);
          detach(t1);
          detach(t2);
          detach(t3);
          detach(if_block3_anchor);
        }
        ctx[31](null);
        destroy_component(modal, detaching);
        if (if_block0)
          if_block0.d(detaching);
        if (if_block1)
          if_block1.d(detaching);
        if (if_block2)
          if_block2.d(detaching);
        if (if_block3)
          if_block3.d(detaching);
      }
    };
  }
  function instance42($$self, $$props, $$invalidate) {
    let deleteMessage;
    let filteredVaults;
    let { vaultService: vaultService2 } = $$props;
    let { currentUser: currentUser2 = null } = $$props;
    let vaults = [];
    let isAdmin = false;
    let searchQuery = "";
    let openMenuId = null;
    let modalRef;
    let activeDialog = null;
    let targetVault = null;
    let dialogValue = "";
    let errorMessage = "";
    let pendingReload = false;
    let version = "";
    const menuItems = [
      { id: "rename", label: "Rename" },
      {
        id: "delete",
        label: "Delete",
        danger: true
      }
    ];
    let currentVaultId = vaultService2.getCurrentVaultId();
    async function fetchVersion() {
      try {
        const res = await fetch("/api/version");
        const data = await res.json();
        $$invalidate(9, version = data.version);
      } catch (e) {
        console.warn("[VaultManager] Failed to fetch version:", e);
      }
    }
    async function refreshVaults() {
      try {
        $$invalidate(0, vaults = await vaultService2.listVaults());
      } catch {
        $$invalidate(0, vaults = []);
      }
    }
    function openVault(vault) {
      if (vault.id === currentVaultId) {
        modalRef.dismiss();
        return;
      }
      vaultService2.openVault(vault.id);
    }
    function toggleMenu(vaultId) {
      if (openMenuId === vaultId) {
        $$invalidate(4, openMenuId = null);
      } else {
        $$invalidate(4, openMenuId = vaultId);
      }
    }
    function onMenuSelect(vault, item) {
      $$invalidate(4, openMenuId = null);
      if (item.id === "rename") {
        showRenameDialog(vault);
      } else if (item.id === "delete") {
        showDeleteDialog(vault);
      }
    }
    function showCreateDialog() {
      $$invalidate(7, dialogValue = "");
      $$invalidate(6, activeDialog = "create");
    }
    function showRenameDialog(vault) {
      $$invalidate(2, targetVault = vault);
      $$invalidate(7, dialogValue = vault.name);
      $$invalidate(6, activeDialog = "rename");
    }
    function showDeleteDialog(vault) {
      $$invalidate(2, targetVault = vault);
      $$invalidate(6, activeDialog = "delete");
    }
    function closeDialog() {
      $$invalidate(6, activeDialog = null);
      $$invalidate(2, targetVault = null);
      $$invalidate(7, dialogValue = "");
    }
    async function onCreateConfirm(e) {
      const name = e.detail.trim();
      if (!name) {
        return;
      }
      try {
        $$invalidate(0, vaults = await vaultService2.createVault(name));
        closeDialog();
      } catch (err) {
        $$invalidate(8, errorMessage = "Failed to create vault: " + err.message);
        $$invalidate(6, activeDialog = "error");
      }
    }
    async function onRenameConfirm(e) {
      const trimmed = e.detail.trim();
      if (!trimmed || trimmed === targetVault.name) {
        closeDialog();
        return;
      }
      const wasCurrentVault = targetVault.id === currentVaultId;
      try {
        $$invalidate(0, vaults = await vaultService2.renameVault(targetVault.id, trimmed));
        closeDialog();
        if (wasCurrentVault) {
          $$invalidate(10, currentVaultId = vaultService2.getCurrentVaultId());
          pendingReload = true;
        }
      } catch (err) {
        $$invalidate(8, errorMessage = "Failed to rename vault: " + err.message);
        $$invalidate(6, activeDialog = "error");
      }
    }
    async function onDeleteConfirm() {
      try {
        const { wasCurrentVault } = await vaultService2.deleteVault(targetVault.id);
        closeDialog();
        $$invalidate(0, vaults = await vaultService2.listVaults());
        if (wasCurrentVault) {
          vaultService2.openVault("");
        }
      } catch (err) {
        $$invalidate(8, errorMessage = "Failed to delete vault: " + err.message);
        $$invalidate(6, activeDialog = "error");
      }
    }
    function onModalClose() {
      if (pendingReload) {
        window.location.reload();
      }
    }
    function onEscape() {
      if (openMenuId) {
        $$invalidate(4, openMenuId = null);
      } else {
        modalRef.dismiss();
      }
    }
    function showAdmin() {
      modalRef.dismiss();
      new AdminDashboard_default({ target: document.body });
    }
    onMount(() => {
      var _a, _b;
      const perms = window.__ignisPermissions;
      $$invalidate(3, isAdmin = ((_a = perms == null ? void 0 : perms.permissions) == null ? void 0 : _a.includes("*")) || ((_b = perms == null ? void 0 : perms.permissions) == null ? void 0 : _b.includes("admin:*")));
      refreshVaults();
      fetchVersion();
    });
    const input_handler = (e) => {
      $$invalidate(1, searchQuery = e.detail);
    };
    const toggle_handler = (vault) => toggleMenu(vault.id);
    const select_handler = (vault, e) => onMenuSelect(vault, e.detail);
    const click_handler = (vault) => openVault(vault);
    function modal_binding($$value) {
      binding_callbacks[$$value ? "unshift" : "push"](() => {
        modalRef = $$value;
        $$invalidate(5, modalRef);
      });
    }
    function promptdialog_value_binding(value) {
      dialogValue = value;
      $$invalidate(7, dialogValue);
    }
    function promptdialog_value_binding_1(value) {
      dialogValue = value;
      $$invalidate(7, dialogValue);
    }
    const confirm_handler = () => {
      $$invalidate(6, activeDialog = null);
      $$invalidate(8, errorMessage = "");
    };
    $$self.$$set = ($$props2) => {
      if ("vaultService" in $$props2)
        $$invalidate(25, vaultService2 = $$props2.vaultService);
      if ("currentUser" in $$props2)
        $$invalidate(26, currentUser2 = $$props2.currentUser);
    };
    $$self.$$.update = () => {
      if ($$self.$$.dirty[0] & /*targetVault*/
      4) {
        $:
          $$invalidate(12, deleteMessage = targetVault ? 'Are you sure you want to delete "' + targetVault.name + '"?' : "");
      }
      if ($$self.$$.dirty[0] & /*searchQuery, vaults*/
      3) {
        $:
          $$invalidate(11, filteredVaults = searchQuery ? vaults.filter((v) => v.name.toLowerCase().includes(searchQuery.toLowerCase())) : vaults);
      }
    };
    return [
      vaults,
      searchQuery,
      targetVault,
      isAdmin,
      openMenuId,
      modalRef,
      activeDialog,
      dialogValue,
      errorMessage,
      version,
      currentVaultId,
      filteredVaults,
      deleteMessage,
      menuItems,
      openVault,
      toggleMenu,
      onMenuSelect,
      showCreateDialog,
      closeDialog,
      onCreateConfirm,
      onRenameConfirm,
      onDeleteConfirm,
      onModalClose,
      onEscape,
      showAdmin,
      vaultService2,
      currentUser2,
      input_handler,
      toggle_handler,
      select_handler,
      click_handler,
      modal_binding,
      promptdialog_value_binding,
      promptdialog_value_binding_1,
      confirm_handler
    ];
  }
  var VaultManager = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance42, create_fragment42, safe_not_equal, { vaultService: 25, currentUser: 26 }, add_css16, [-1, -1]);
    }
  };
  var VaultManager_default = VaultManager;

  // packages/ui/src/views/sync/VaultRow.svelte
  function add_css17(target) {
    append_styles(target, "svelte-1kcub1a", ".vault-row.svelte-1kcub1a.svelte-1kcub1a{border:1px solid var(--background-modifier-border);border-radius:0.375rem;overflow:hidden}.vault-row-main.svelte-1kcub1a.svelte-1kcub1a{display:flex;align-items:center;padding:0.75rem 1rem}.vault-row-info.svelte-1kcub1a.svelte-1kcub1a{flex:1;min-width:0}.vault-row-name.svelte-1kcub1a.svelte-1kcub1a{font-weight:600;font-size:0.9375rem;color:var(--text-normal)}.vault-row-region.svelte-1kcub1a.svelte-1kcub1a{font-size:0.8125rem;color:var(--text-muted);margin-top:0.125rem}.vault-row-actions.svelte-1kcub1a.svelte-1kcub1a{display:flex;align-items:center;gap:0.5rem}.vault-row-actions.svelte-1kcub1a .btn.secondary{padding:4px 12px;border-radius:5px;border:none;background:var(--interactive-normal);color:var(--text-normal)}.vault-row-actions.svelte-1kcub1a .btn.secondary:hover:not(:disabled){background:var(--interactive-hover);color:var(--text-normal)}.icon-btn.svelte-1kcub1a.svelte-1kcub1a{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:0.25rem;background:none;color:var(--text-muted);cursor:pointer;box-shadow:none}.icon-btn.svelte-1kcub1a.svelte-1kcub1a:hover{color:var(--text-normal);background:var(--background-modifier-hover)}.vault-row-options.svelte-1kcub1a.svelte-1kcub1a{padding:0.5rem 1rem 1rem;border-top:1px solid var(--background-modifier-border);background:var(--background-primary-alt)}.option-row.svelte-1kcub1a.svelte-1kcub1a{display:flex;align-items:center;justify-content:space-between;padding:0.625rem 0}.option-row.svelte-1kcub1a+.option-row.svelte-1kcub1a{border-top:1px solid var(--background-modifier-border)}.option-label.svelte-1kcub1a.svelte-1kcub1a{flex:1;min-width:0;margin-right:1rem}.option-name.svelte-1kcub1a.svelte-1kcub1a{font-size:0.875rem;font-weight:500;color:var(--text-normal)}.option-desc.svelte-1kcub1a.svelte-1kcub1a{font-size:0.75rem;color:var(--text-muted);margin-top:0.125rem}input.svelte-1kcub1a.svelte-1kcub1a,select.svelte-1kcub1a.svelte-1kcub1a{font-family:var(--font-interface);font-size:0.875rem;padding:0.375rem 0.625rem;border:1px solid var(--background-modifier-border);border-radius:0.375rem;background:var(--background-primary);color:var(--text-normal);min-width:200px}input.svelte-1kcub1a.svelte-1kcub1a:focus,select.svelte-1kcub1a.svelte-1kcub1a:focus{outline:none;border-color:var(--interactive-accent)}.option-footer.svelte-1kcub1a.svelte-1kcub1a{display:flex;justify-content:flex-end;gap:0.5rem;padding-top:0.75rem}");
  }
  function create_else_block5(ctx) {
    let button;
    let current;
    button = new Button_default({
      props: {
        variant: "secondary",
        $$slots: { default: [create_default_slot_27] },
        $$scope: { ctx }
      }
    });
    button.$on(
      "click",
      /*toggleExpand*/
      ctx[7]
    );
    return {
      c() {
        create_component(button.$$.fragment);
      },
      m(target, anchor) {
        mount_component(button, target, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        const button_changes = {};
        if (dirty & /*$$scope, expanded*/
        16388) {
          button_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button.$set(button_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(button.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(button.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(button, detaching);
      }
    };
  }
  function create_if_block_28(ctx) {
    let button;
    let pencil;
    let current;
    let mounted;
    let dispose;
    pencil = new pencil_default({ props: { size: "14" } });
    return {
      c() {
        button = element("button");
        create_component(pencil.$$.fragment);
        attr(button, "class", "icon-btn svelte-1kcub1a");
        attr(button, "title", "Edit sync config");
      },
      m(target, anchor) {
        insert(target, button, anchor);
        mount_component(pencil, button, null);
        current = true;
        if (!mounted) {
          dispose = listen(
            button,
            "click",
            /*toggleExpand*/
            ctx[7]
          );
          mounted = true;
        }
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(pencil.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(pencil.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(button);
        }
        destroy_component(pencil);
        mounted = false;
        dispose();
      }
    };
  }
  function create_default_slot_27(ctx) {
    let t_value = (
      /*expanded*/
      ctx[2] ? "Cancel" : "Connect"
    );
    let t;
    return {
      c() {
        t = text(t_value);
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      p(ctx2, dirty) {
        if (dirty & /*expanded*/
        4 && t_value !== (t_value = /*expanded*/
        ctx2[2] ? "Cancel" : "Connect"))
          set_data(t, t_value);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_if_block13(ctx) {
    let div12;
    let div3;
    let div2;
    let t3;
    let input0;
    let t4;
    let div7;
    let div6;
    let t8;
    let input1;
    let t9;
    let div10;
    let div9;
    let t11;
    let select;
    let option0;
    let option1;
    let option2;
    let t15;
    let div11;
    let t16;
    let button;
    let current;
    let mounted;
    let dispose;
    let if_block = (
      /*expanded*/
      ctx[2] && !/*linked*/
      ctx[1] && create_if_block_19(ctx)
    );
    button = new Button_default({
      props: {
        variant: "primary",
        disabled: (
          /*linking*/
          ctx[6]
        ),
        $$slots: { default: [create_default_slot36] },
        $$scope: { ctx }
      }
    });
    button.$on(
      "click",
      /*onLink*/
      ctx[8]
    );
    return {
      c() {
        div12 = element("div");
        div3 = element("div");
        div2 = element("div");
        div2.innerHTML = `<div class="option-name svelte-1kcub1a">Vault password</div> <div class="option-desc svelte-1kcub1a">Required if the vault uses end-to-end encryption</div>`;
        t3 = space();
        input0 = element("input");
        t4 = space();
        div7 = element("div");
        div6 = element("div");
        div6.innerHTML = `<div class="option-name svelte-1kcub1a">Device name</div> <div class="option-desc svelte-1kcub1a">Identifies this server in sync version history</div>`;
        t8 = space();
        input1 = element("input");
        t9 = space();
        div10 = element("div");
        div9 = element("div");
        div9.innerHTML = `<div class="option-name svelte-1kcub1a">Sync mode</div>`;
        t11 = space();
        select = element("select");
        option0 = element("option");
        option0.textContent = "Bidirectional";
        option1 = element("option");
        option1.textContent = "Pull only (remote to server)";
        option2 = element("option");
        option2.textContent = "Mirror remote (exact copy)";
        t15 = space();
        div11 = element("div");
        if (if_block)
          if_block.c();
        t16 = space();
        create_component(button.$$.fragment);
        attr(div2, "class", "option-label svelte-1kcub1a");
        attr(input0, "type", "password");
        attr(input0, "placeholder", "Leave empty if not encrypted");
        attr(input0, "class", "svelte-1kcub1a");
        attr(div3, "class", "option-row svelte-1kcub1a");
        attr(div6, "class", "option-label svelte-1kcub1a");
        attr(input1, "type", "text");
        attr(input1, "class", "svelte-1kcub1a");
        attr(div7, "class", "option-row svelte-1kcub1a");
        attr(div9, "class", "option-label svelte-1kcub1a");
        option0.__value = "bidirectional";
        set_input_value(option0, option0.__value);
        option1.__value = "pull-only";
        set_input_value(option1, option1.__value);
        option2.__value = "mirror-remote";
        set_input_value(option2, option2.__value);
        attr(select, "class", "svelte-1kcub1a");
        if (
          /*mode*/
          ctx[5] === void 0
        )
          add_render_callback(() => (
            /*select_change_handler*/
            ctx[12].call(select)
          ));
        attr(div10, "class", "option-row svelte-1kcub1a");
        attr(div11, "class", "option-footer svelte-1kcub1a");
        attr(div12, "class", "vault-row-options svelte-1kcub1a");
      },
      m(target, anchor) {
        insert(target, div12, anchor);
        append(div12, div3);
        append(div3, div2);
        append(div3, t3);
        append(div3, input0);
        set_input_value(
          input0,
          /*vaultPassword*/
          ctx[3]
        );
        append(div12, t4);
        append(div12, div7);
        append(div7, div6);
        append(div7, t8);
        append(div7, input1);
        set_input_value(
          input1,
          /*deviceName*/
          ctx[4]
        );
        append(div12, t9);
        append(div12, div10);
        append(div10, div9);
        append(div10, t11);
        append(div10, select);
        append(select, option0);
        append(select, option1);
        append(select, option2);
        select_option(
          select,
          /*mode*/
          ctx[5],
          true
        );
        append(div12, t15);
        append(div12, div11);
        if (if_block)
          if_block.m(div11, null);
        append(div11, t16);
        mount_component(button, div11, null);
        current = true;
        if (!mounted) {
          dispose = [
            listen(
              input0,
              "input",
              /*input0_input_handler*/
              ctx[10]
            ),
            listen(
              input1,
              "input",
              /*input1_input_handler*/
              ctx[11]
            ),
            listen(
              select,
              "change",
              /*select_change_handler*/
              ctx[12]
            )
          ];
          mounted = true;
        }
      },
      p(ctx2, dirty) {
        if (dirty & /*vaultPassword*/
        8 && input0.value !== /*vaultPassword*/
        ctx2[3]) {
          set_input_value(
            input0,
            /*vaultPassword*/
            ctx2[3]
          );
        }
        if (dirty & /*deviceName*/
        16 && input1.value !== /*deviceName*/
        ctx2[4]) {
          set_input_value(
            input1,
            /*deviceName*/
            ctx2[4]
          );
        }
        if (dirty & /*mode*/
        32) {
          select_option(
            select,
            /*mode*/
            ctx2[5]
          );
        }
        if (
          /*expanded*/
          ctx2[2] && !/*linked*/
          ctx2[1]
        ) {
          if (if_block) {
            if_block.p(ctx2, dirty);
            if (dirty & /*expanded, linked*/
            6) {
              transition_in(if_block, 1);
            }
          } else {
            if_block = create_if_block_19(ctx2);
            if_block.c();
            transition_in(if_block, 1);
            if_block.m(div11, t16);
          }
        } else if (if_block) {
          group_outros();
          transition_out(if_block, 1, 1, () => {
            if_block = null;
          });
          check_outros();
        }
        const button_changes = {};
        if (dirty & /*linking*/
        64)
          button_changes.disabled = /*linking*/
          ctx2[6];
        if (dirty & /*$$scope, linking*/
        16448) {
          button_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button.$set(button_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(if_block);
        transition_in(button.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(if_block);
        transition_out(button.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div12);
        }
        if (if_block)
          if_block.d();
        destroy_component(button);
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function create_if_block_19(ctx) {
    let button;
    let current;
    button = new Button_default({
      props: {
        variant: "secondary",
        $$slots: { default: [create_default_slot_110] },
        $$scope: { ctx }
      }
    });
    button.$on(
      "click",
      /*toggleExpand*/
      ctx[7]
    );
    return {
      c() {
        create_component(button.$$.fragment);
      },
      m(target, anchor) {
        mount_component(button, target, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        const button_changes = {};
        if (dirty & /*$$scope*/
        16384) {
          button_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button.$set(button_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(button.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(button.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(button, detaching);
      }
    };
  }
  function create_default_slot_110(ctx) {
    let t;
    return {
      c() {
        t = text("Cancel");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_default_slot36(ctx) {
    let t_value = (
      /*linking*/
      ctx[6] ? "Linking..." : "Link Vault"
    );
    let t;
    return {
      c() {
        t = text(t_value);
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      p(ctx2, dirty) {
        if (dirty & /*linking*/
        64 && t_value !== (t_value = /*linking*/
        ctx2[6] ? "Linking..." : "Link Vault"))
          set_data(t, t_value);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_fragment43(ctx) {
    let div5;
    let div4;
    let div2;
    let div0;
    let t0_value = (
      /*vault*/
      ctx[0].name + ""
    );
    let t0;
    let t1;
    let div1;
    let t2_value = (
      /*vault*/
      (ctx[0].region || "Unknown region") + ""
    );
    let t2;
    let t3;
    let div3;
    let current_block_type_index;
    let if_block0;
    let t4;
    let current;
    const if_block_creators = [create_if_block_28, create_else_block5];
    const if_blocks = [];
    function select_block_type(ctx2, dirty) {
      if (
        /*linked*/
        ctx2[1]
      )
        return 0;
      return 1;
    }
    current_block_type_index = select_block_type(ctx, -1);
    if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    let if_block1 = (
      /*expanded*/
      ctx[2] && create_if_block13(ctx)
    );
    return {
      c() {
        div5 = element("div");
        div4 = element("div");
        div2 = element("div");
        div0 = element("div");
        t0 = text(t0_value);
        t1 = space();
        div1 = element("div");
        t2 = text(t2_value);
        t3 = space();
        div3 = element("div");
        if_block0.c();
        t4 = space();
        if (if_block1)
          if_block1.c();
        attr(div0, "class", "vault-row-name svelte-1kcub1a");
        attr(div1, "class", "vault-row-region svelte-1kcub1a");
        attr(div2, "class", "vault-row-info svelte-1kcub1a");
        attr(div3, "class", "vault-row-actions svelte-1kcub1a");
        attr(div4, "class", "vault-row-main svelte-1kcub1a");
        attr(div5, "class", "vault-row svelte-1kcub1a");
        toggle_class(
          div5,
          "expanded",
          /*expanded*/
          ctx[2]
        );
      },
      m(target, anchor) {
        insert(target, div5, anchor);
        append(div5, div4);
        append(div4, div2);
        append(div2, div0);
        append(div0, t0);
        append(div2, t1);
        append(div2, div1);
        append(div1, t2);
        append(div4, t3);
        append(div4, div3);
        if_blocks[current_block_type_index].m(div3, null);
        append(div5, t4);
        if (if_block1)
          if_block1.m(div5, null);
        current = true;
      },
      p(ctx2, [dirty]) {
        if ((!current || dirty & /*vault*/
        1) && t0_value !== (t0_value = /*vault*/
        ctx2[0].name + ""))
          set_data(t0, t0_value);
        if ((!current || dirty & /*vault*/
        1) && t2_value !== (t2_value = /*vault*/
        (ctx2[0].region || "Unknown region") + ""))
          set_data(t2, t2_value);
        let previous_block_index = current_block_type_index;
        current_block_type_index = select_block_type(ctx2, dirty);
        if (current_block_type_index === previous_block_index) {
          if_blocks[current_block_type_index].p(ctx2, dirty);
        } else {
          group_outros();
          transition_out(if_blocks[previous_block_index], 1, 1, () => {
            if_blocks[previous_block_index] = null;
          });
          check_outros();
          if_block0 = if_blocks[current_block_type_index];
          if (!if_block0) {
            if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx2);
            if_block0.c();
          } else {
            if_block0.p(ctx2, dirty);
          }
          transition_in(if_block0, 1);
          if_block0.m(div3, null);
        }
        if (
          /*expanded*/
          ctx2[2]
        ) {
          if (if_block1) {
            if_block1.p(ctx2, dirty);
            if (dirty & /*expanded*/
            4) {
              transition_in(if_block1, 1);
            }
          } else {
            if_block1 = create_if_block13(ctx2);
            if_block1.c();
            transition_in(if_block1, 1);
            if_block1.m(div5, null);
          }
        } else if (if_block1) {
          group_outros();
          transition_out(if_block1, 1, 1, () => {
            if_block1 = null;
          });
          check_outros();
        }
        if (!current || dirty & /*expanded*/
        4) {
          toggle_class(
            div5,
            "expanded",
            /*expanded*/
            ctx2[2]
          );
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(if_block0);
        transition_in(if_block1);
        current = true;
      },
      o(local) {
        transition_out(if_block0);
        transition_out(if_block1);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div5);
        }
        if_blocks[current_block_type_index].d();
        if (if_block1)
          if_block1.d();
      }
    };
  }
  function instance43($$self, $$props, $$invalidate) {
    let { vault } = $$props;
    let { linked = false } = $$props;
    const dispatch2 = createEventDispatcher();
    let expanded = false;
    let vaultPassword = "";
    let deviceName = "ignis-headless";
    let mode = "bidirectional";
    let linking = false;
    function toggleExpand() {
      $$invalidate(2, expanded = !expanded);
    }
    async function onLink() {
      $$invalidate(6, linking = true);
      dispatch2("link", {
        vault,
        vaultPassword: vaultPassword || void 0,
        deviceName,
        mode
      });
    }
    function setLinking(val) {
      $$invalidate(6, linking = val);
    }
    function input0_input_handler() {
      vaultPassword = this.value;
      $$invalidate(3, vaultPassword);
    }
    function input1_input_handler() {
      deviceName = this.value;
      $$invalidate(4, deviceName);
    }
    function select_change_handler() {
      mode = select_value(this);
      $$invalidate(5, mode);
    }
    $$self.$$set = ($$props2) => {
      if ("vault" in $$props2)
        $$invalidate(0, vault = $$props2.vault);
      if ("linked" in $$props2)
        $$invalidate(1, linked = $$props2.linked);
    };
    return [
      vault,
      linked,
      expanded,
      vaultPassword,
      deviceName,
      mode,
      linking,
      toggleExpand,
      onLink,
      setLinking,
      input0_input_handler,
      input1_input_handler,
      select_change_handler
    ];
  }
  var VaultRow = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance43, create_fragment43, safe_not_equal, { vault: 0, linked: 1, setLinking: 9 }, add_css17);
    }
    get setLinking() {
      return this.$$.ctx[9];
    }
  };
  var VaultRow_default = VaultRow;

  // packages/ui/src/views/sync/VaultList.svelte
  function add_css18(target) {
    append_styles(target, "svelte-18jtktw", ".vault-list-heading.svelte-18jtktw{font-size:1rem;font-weight:600;color:var(--text-normal);margin:0 0 0.75rem}.vault-list-empty.svelte-18jtktw{color:var(--text-muted);font-size:0.875rem;margin:0;padding:1rem 0}.vault-list-items.svelte-18jtktw{display:flex;flex-direction:column;gap:0.5rem;min-height:180px;margin-bottom:1rem}.vault-list-spinner-area.svelte-18jtktw{display:flex;align-items:center;justify-content:center;flex:1;min-height:180px}.vault-list-spinner.svelte-18jtktw{width:24px;height:24px;border:2px solid var(--background-modifier-border);border-top-color:var(--text-muted);border-radius:50%;animation:svelte-18jtktw-ignis-vault-spin 0.8s linear infinite}@keyframes svelte-18jtktw-ignis-vault-spin{to{transform:rotate(360deg)}}.vault-list-footer.svelte-18jtktw{display:flex;justify-content:flex-end}");
  }
  function get_each_context9(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[5] = list[i];
    return child_ctx;
  }
  function create_else_block6(ctx) {
    let each_blocks = [];
    let each_1_lookup = /* @__PURE__ */ new Map();
    let each_1_anchor;
    let current;
    let each_value = ensure_array_like(
      /*vaults*/
      ctx[0]
    );
    const get_key = (ctx2) => (
      /*vault*/
      ctx2[5].id
    );
    for (let i = 0; i < each_value.length; i += 1) {
      let child_ctx = get_each_context9(ctx, each_value, i);
      let key = get_key(child_ctx);
      each_1_lookup.set(key, each_blocks[i] = create_each_block9(key, child_ctx));
    }
    return {
      c() {
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        each_1_anchor = empty();
      },
      m(target, anchor) {
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(target, anchor);
          }
        }
        insert(target, each_1_anchor, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        if (dirty & /*vaults, onLink*/
        5) {
          each_value = ensure_array_like(
            /*vaults*/
            ctx2[0]
          );
          group_outros();
          each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx2, each_value, each_1_lookup, each_1_anchor.parentNode, outro_and_destroy_block, create_each_block9, each_1_anchor, get_each_context9);
          check_outros();
        }
      },
      i(local) {
        if (current)
          return;
        for (let i = 0; i < each_value.length; i += 1) {
          transition_in(each_blocks[i]);
        }
        current = true;
      },
      o(local) {
        for (let i = 0; i < each_blocks.length; i += 1) {
          transition_out(each_blocks[i]);
        }
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(each_1_anchor);
        }
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].d(detaching);
        }
      }
    };
  }
  function create_if_block_110(ctx) {
    let p;
    return {
      c() {
        p = element("p");
        p.textContent = "No remote vaults found. Create one to get started.";
        attr(p, "class", "vault-list-empty svelte-18jtktw");
      },
      m(target, anchor) {
        insert(target, p, anchor);
      },
      p: noop,
      i: noop,
      o: noop,
      d(detaching) {
        if (detaching) {
          detach(p);
        }
      }
    };
  }
  function create_if_block14(ctx) {
    let div1;
    return {
      c() {
        div1 = element("div");
        div1.innerHTML = `<div class="vault-list-spinner svelte-18jtktw"></div>`;
        attr(div1, "class", "vault-list-spinner-area svelte-18jtktw");
      },
      m(target, anchor) {
        insert(target, div1, anchor);
      },
      p: noop,
      i: noop,
      o: noop,
      d(detaching) {
        if (detaching) {
          detach(div1);
        }
      }
    };
  }
  function create_each_block9(key_1, ctx) {
    let first;
    let vaultrow;
    let current;
    vaultrow = new VaultRow_default({ props: { vault: (
      /*vault*/
      ctx[5]
    ) } });
    vaultrow.$on(
      "link",
      /*onLink*/
      ctx[2]
    );
    return {
      key: key_1,
      first: null,
      c() {
        first = empty();
        create_component(vaultrow.$$.fragment);
        this.first = first;
      },
      m(target, anchor) {
        insert(target, first, anchor);
        mount_component(vaultrow, target, anchor);
        current = true;
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        const vaultrow_changes = {};
        if (dirty & /*vaults*/
        1)
          vaultrow_changes.vault = /*vault*/
          ctx[5];
        vaultrow.$set(vaultrow_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(vaultrow.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(vaultrow.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(first);
        }
        destroy_component(vaultrow, detaching);
      }
    };
  }
  function create_default_slot37(ctx) {
    let t;
    return {
      c() {
        t = text("Create new vault");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_fragment44(ctx) {
    let div2;
    let h3;
    let t1;
    let div0;
    let current_block_type_index;
    let if_block;
    let t2;
    let div1;
    let button;
    let current;
    const if_block_creators = [create_if_block14, create_if_block_110, create_else_block6];
    const if_blocks = [];
    function select_block_type(ctx2, dirty) {
      if (
        /*loading*/
        ctx2[1]
      )
        return 0;
      if (
        /*vaults*/
        ctx2[0].length === 0
      )
        return 1;
      return 2;
    }
    current_block_type_index = select_block_type(ctx, -1);
    if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    button = new Button_default({
      props: {
        variant: "primary",
        disabled: (
          /*loading*/
          ctx[1]
        ),
        $$slots: { default: [create_default_slot37] },
        $$scope: { ctx }
      }
    });
    button.$on(
      "click",
      /*onCreate*/
      ctx[3]
    );
    return {
      c() {
        div2 = element("div");
        h3 = element("h3");
        h3.textContent = "Your remote vaults";
        t1 = space();
        div0 = element("div");
        if_block.c();
        t2 = space();
        div1 = element("div");
        create_component(button.$$.fragment);
        attr(h3, "class", "vault-list-heading svelte-18jtktw");
        attr(div0, "class", "vault-list-items svelte-18jtktw");
        attr(div1, "class", "vault-list-footer svelte-18jtktw");
        attr(div2, "class", "vault-list");
      },
      m(target, anchor) {
        insert(target, div2, anchor);
        append(div2, h3);
        append(div2, t1);
        append(div2, div0);
        if_blocks[current_block_type_index].m(div0, null);
        append(div2, t2);
        append(div2, div1);
        mount_component(button, div1, null);
        current = true;
      },
      p(ctx2, [dirty]) {
        let previous_block_index = current_block_type_index;
        current_block_type_index = select_block_type(ctx2, dirty);
        if (current_block_type_index === previous_block_index) {
          if_blocks[current_block_type_index].p(ctx2, dirty);
        } else {
          group_outros();
          transition_out(if_blocks[previous_block_index], 1, 1, () => {
            if_blocks[previous_block_index] = null;
          });
          check_outros();
          if_block = if_blocks[current_block_type_index];
          if (!if_block) {
            if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx2);
            if_block.c();
          } else {
            if_block.p(ctx2, dirty);
          }
          transition_in(if_block, 1);
          if_block.m(div0, null);
        }
        const button_changes = {};
        if (dirty & /*loading*/
        2)
          button_changes.disabled = /*loading*/
          ctx2[1];
        if (dirty & /*$$scope*/
        256) {
          button_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button.$set(button_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(if_block);
        transition_in(button.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(if_block);
        transition_out(button.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div2);
        }
        if_blocks[current_block_type_index].d();
        destroy_component(button);
      }
    };
  }
  function instance44($$self, $$props, $$invalidate) {
    let { vaults = [] } = $$props;
    let { loading = false } = $$props;
    const dispatch2 = createEventDispatcher();
    function onLink(e) {
      dispatch2("link", e.detail);
    }
    function onCreate() {
      dispatch2("create");
    }
    $$self.$$set = ($$props2) => {
      if ("vaults" in $$props2)
        $$invalidate(0, vaults = $$props2.vaults);
      if ("loading" in $$props2)
        $$invalidate(1, loading = $$props2.loading);
    };
    return [vaults, loading, onLink, onCreate];
  }
  var VaultList = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance44, create_fragment44, safe_not_equal, { vaults: 0, loading: 1 }, add_css18);
    }
  };
  var VaultList_default = VaultList;

  // packages/ui/src/views/sync/CreateVaultForm.svelte
  function add_css19(target) {
    append_styles(target, "svelte-ik3dso", ".form-row.svelte-ik3dso.svelte-ik3dso{display:flex;align-items:flex-start;justify-content:space-between;padding:0.75rem 0}.form-row.svelte-ik3dso+.form-row.svelte-ik3dso{border-top:1px solid var(--background-modifier-border)}.form-label.svelte-ik3dso.svelte-ik3dso{flex:1;min-width:0;margin-right:1rem}.form-name.svelte-ik3dso.svelte-ik3dso{font-size:0.875rem;font-weight:500;color:var(--text-normal)}.form-desc.svelte-ik3dso.svelte-ik3dso{font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;line-height:1.4}.form-warning.svelte-ik3dso.svelte-ik3dso{color:var(--text-error)}input.svelte-ik3dso.svelte-ik3dso,select.svelte-ik3dso.svelte-ik3dso{font-family:var(--font-interface);font-size:0.875rem;padding:0.375rem 0.625rem;border:1px solid var(--background-modifier-border);border-radius:0.375rem;background:var(--background-primary);color:var(--text-normal);min-width:200px;margin-top:0.125rem}input.svelte-ik3dso.svelte-ik3dso:focus,select.svelte-ik3dso.svelte-ik3dso:focus{outline:none;border-color:var(--interactive-accent)}.form-error.svelte-ik3dso.svelte-ik3dso{color:var(--text-error);font-size:0.8125rem;padding:0.5rem 0}.form-footer.svelte-ik3dso.svelte-ik3dso{display:flex;justify-content:flex-end;gap:0.5rem;padding-top:0.75rem;border-top:1px solid var(--background-modifier-border)}");
  }
  function create_if_block_111(ctx) {
    let div3;
    let div2;
    let t4;
    let input;
    let mounted;
    let dispose;
    return {
      c() {
        div3 = element("div");
        div2 = element("div");
        div2.innerHTML = `<div class="form-name svelte-ik3dso">Encryption password</div> <div class="form-desc svelte-ik3dso"><span class="form-warning svelte-ik3dso">If you forget this password, any remote data will remain unusable forever.</span>
          This does not affect your local data.</div>`;
        t4 = space();
        input = element("input");
        attr(div2, "class", "form-label svelte-ik3dso");
        attr(input, "type", "password");
        attr(input, "placeholder", "Your password");
        attr(input, "class", "svelte-ik3dso");
        attr(div3, "class", "form-row svelte-ik3dso");
      },
      m(target, anchor) {
        insert(target, div3, anchor);
        append(div3, div2);
        append(div3, t4);
        append(div3, input);
        set_input_value(
          input,
          /*password*/
          ctx[3]
        );
        if (!mounted) {
          dispose = listen(
            input,
            "input",
            /*input_input_handler_1*/
            ctx[11]
          );
          mounted = true;
        }
      },
      p(ctx2, dirty) {
        if (dirty & /*password*/
        8 && input.value !== /*password*/
        ctx2[3]) {
          set_input_value(
            input,
            /*password*/
            ctx2[3]
          );
        }
      },
      d(detaching) {
        if (detaching) {
          detach(div3);
        }
        mounted = false;
        dispose();
      }
    };
  }
  function create_if_block15(ctx) {
    let div;
    let t;
    return {
      c() {
        div = element("div");
        t = text(
          /*error*/
          ctx[5]
        );
        attr(div, "class", "form-error svelte-ik3dso");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, t);
      },
      p(ctx2, dirty) {
        if (dirty & /*error*/
        32)
          set_data(
            t,
            /*error*/
            ctx2[5]
          );
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_default_slot_111(ctx) {
    let t;
    return {
      c() {
        t = text("Back");
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_default_slot38(ctx) {
    let t_value = (
      /*creating*/
      ctx[4] ? "Creating..." : "Create"
    );
    let t;
    return {
      c() {
        t = text(t_value);
      },
      m(target, anchor) {
        insert(target, t, anchor);
      },
      p(ctx2, dirty) {
        if (dirty & /*creating*/
        16 && t_value !== (t_value = /*creating*/
        ctx2[4] ? "Creating..." : "Create"))
          set_data(t, t_value);
      },
      d(detaching) {
        if (detaching) {
          detach(t);
        }
      }
    };
  }
  function create_fragment45(ctx) {
    let div13;
    let div3;
    let div2;
    let t3;
    let input;
    let t4;
    let div7;
    let div6;
    let t8;
    let select0;
    let option0;
    let option1;
    let option2;
    let option3;
    let option4;
    let t14;
    let div11;
    let div10;
    let t19;
    let select1;
    let option5;
    let option6;
    let t22;
    let t23;
    let t24;
    let div12;
    let button0;
    let t25;
    let button1;
    let current;
    let mounted;
    let dispose;
    let if_block0 = (
      /*encryption*/
      ctx[2] === "e2ee" && create_if_block_111(ctx)
    );
    let if_block1 = (
      /*error*/
      ctx[5] && create_if_block15(ctx)
    );
    button0 = new Button_default({
      props: {
        variant: "secondary",
        $$slots: { default: [create_default_slot_111] },
        $$scope: { ctx }
      }
    });
    button0.$on(
      "click",
      /*onBack*/
      ctx[7]
    );
    button1 = new Button_default({
      props: {
        variant: "primary",
        disabled: (
          /*creating*/
          ctx[4]
        ),
        $$slots: { default: [create_default_slot38] },
        $$scope: { ctx }
      }
    });
    button1.$on(
      "click",
      /*onSubmit*/
      ctx[6]
    );
    return {
      c() {
        div13 = element("div");
        div3 = element("div");
        div2 = element("div");
        div2.innerHTML = `<div class="form-name svelte-ik3dso">Vault name</div> <div class="form-desc svelte-ik3dso">Helps you remember what this vault is for</div>`;
        t3 = space();
        input = element("input");
        t4 = space();
        div7 = element("div");
        div6 = element("div");
        div6.innerHTML = `<div class="form-name svelte-ik3dso">Region</div> <div class="form-desc svelte-ik3dso">Select the server region closest to you</div>`;
        t8 = space();
        select0 = element("select");
        option0 = element("option");
        option0.textContent = "Automatic";
        option1 = element("option");
        option1.textContent = "Europe";
        option2 = element("option");
        option2.textContent = "North America";
        option3 = element("option");
        option3.textContent = "Asia";
        option4 = element("option");
        option4.textContent = "Oceania";
        t14 = space();
        div11 = element("div");
        div10 = element("div");
        div10.innerHTML = `<div class="form-name svelte-ik3dso">Encryption</div> <div class="form-desc svelte-ik3dso">End-to-end encryption requires a password you must remember.
        <span class="form-warning svelte-ik3dso">This cannot be changed later.</span></div>`;
        t19 = space();
        select1 = element("select");
        option5 = element("option");
        option5.textContent = "End-to-end encryption";
        option6 = element("option");
        option6.textContent = "Standard encryption";
        t22 = space();
        if (if_block0)
          if_block0.c();
        t23 = space();
        if (if_block1)
          if_block1.c();
        t24 = space();
        div12 = element("div");
        create_component(button0.$$.fragment);
        t25 = space();
        create_component(button1.$$.fragment);
        attr(div2, "class", "form-label svelte-ik3dso");
        attr(input, "type", "text");
        attr(input, "placeholder", "My awesome vault");
        attr(input, "class", "svelte-ik3dso");
        attr(div3, "class", "form-row svelte-ik3dso");
        attr(div6, "class", "form-label svelte-ik3dso");
        option0.__value = "";
        set_input_value(option0, option0.__value);
        option1.__value = "europe";
        set_input_value(option1, option1.__value);
        option2.__value = "north-america";
        set_input_value(option2, option2.__value);
        option3.__value = "asia";
        set_input_value(option3, option3.__value);
        option4.__value = "oceania";
        set_input_value(option4, option4.__value);
        attr(select0, "class", "svelte-ik3dso");
        if (
          /*region*/
          ctx[1] === void 0
        )
          add_render_callback(() => (
            /*select0_change_handler*/
            ctx[9].call(select0)
          ));
        attr(div7, "class", "form-row svelte-ik3dso");
        attr(div10, "class", "form-label svelte-ik3dso");
        option5.__value = "e2ee";
        set_input_value(option5, option5.__value);
        option6.__value = "standard";
        set_input_value(option6, option6.__value);
        attr(select1, "class", "svelte-ik3dso");
        if (
          /*encryption*/
          ctx[2] === void 0
        )
          add_render_callback(() => (
            /*select1_change_handler*/
            ctx[10].call(select1)
          ));
        attr(div11, "class", "form-row svelte-ik3dso");
        attr(div12, "class", "form-footer svelte-ik3dso");
        attr(div13, "class", "create-form");
      },
      m(target, anchor) {
        insert(target, div13, anchor);
        append(div13, div3);
        append(div3, div2);
        append(div3, t3);
        append(div3, input);
        set_input_value(
          input,
          /*name*/
          ctx[0]
        );
        append(div13, t4);
        append(div13, div7);
        append(div7, div6);
        append(div7, t8);
        append(div7, select0);
        append(select0, option0);
        append(select0, option1);
        append(select0, option2);
        append(select0, option3);
        append(select0, option4);
        select_option(
          select0,
          /*region*/
          ctx[1],
          true
        );
        append(div13, t14);
        append(div13, div11);
        append(div11, div10);
        append(div11, t19);
        append(div11, select1);
        append(select1, option5);
        append(select1, option6);
        select_option(
          select1,
          /*encryption*/
          ctx[2],
          true
        );
        append(div13, t22);
        if (if_block0)
          if_block0.m(div13, null);
        append(div13, t23);
        if (if_block1)
          if_block1.m(div13, null);
        append(div13, t24);
        append(div13, div12);
        mount_component(button0, div12, null);
        append(div12, t25);
        mount_component(button1, div12, null);
        current = true;
        if (!mounted) {
          dispose = [
            listen(
              input,
              "input",
              /*input_input_handler*/
              ctx[8]
            ),
            listen(
              select0,
              "change",
              /*select0_change_handler*/
              ctx[9]
            ),
            listen(
              select1,
              "change",
              /*select1_change_handler*/
              ctx[10]
            )
          ];
          mounted = true;
        }
      },
      p(ctx2, [dirty]) {
        if (dirty & /*name*/
        1 && input.value !== /*name*/
        ctx2[0]) {
          set_input_value(
            input,
            /*name*/
            ctx2[0]
          );
        }
        if (dirty & /*region*/
        2) {
          select_option(
            select0,
            /*region*/
            ctx2[1]
          );
        }
        if (dirty & /*encryption*/
        4) {
          select_option(
            select1,
            /*encryption*/
            ctx2[2]
          );
        }
        if (
          /*encryption*/
          ctx2[2] === "e2ee"
        ) {
          if (if_block0) {
            if_block0.p(ctx2, dirty);
          } else {
            if_block0 = create_if_block_111(ctx2);
            if_block0.c();
            if_block0.m(div13, t23);
          }
        } else if (if_block0) {
          if_block0.d(1);
          if_block0 = null;
        }
        if (
          /*error*/
          ctx2[5]
        ) {
          if (if_block1) {
            if_block1.p(ctx2, dirty);
          } else {
            if_block1 = create_if_block15(ctx2);
            if_block1.c();
            if_block1.m(div13, t24);
          }
        } else if (if_block1) {
          if_block1.d(1);
          if_block1 = null;
        }
        const button0_changes = {};
        if (dirty & /*$$scope*/
        8192) {
          button0_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button0.$set(button0_changes);
        const button1_changes = {};
        if (dirty & /*creating*/
        16)
          button1_changes.disabled = /*creating*/
          ctx2[4];
        if (dirty & /*$$scope, creating*/
        8208) {
          button1_changes.$$scope = { dirty, ctx: ctx2 };
        }
        button1.$set(button1_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(button0.$$.fragment, local);
        transition_in(button1.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(button0.$$.fragment, local);
        transition_out(button1.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div13);
        }
        if (if_block0)
          if_block0.d();
        if (if_block1)
          if_block1.d();
        destroy_component(button0);
        destroy_component(button1);
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function instance45($$self, $$props, $$invalidate) {
    const dispatch2 = createEventDispatcher();
    let name = "";
    let region = "";
    let encryption = "e2ee";
    let password = "";
    let creating = false;
    let error = "";
    async function onSubmit() {
      $$invalidate(5, error = "");
      if (!name.trim()) {
        $$invalidate(5, error = "Vault name is required");
        return;
      }
      if (encryption === "e2ee" && !password) {
        $$invalidate(5, error = "Encryption password is required for end-to-end encryption");
        return;
      }
      $$invalidate(4, creating = true);
      try {
        const res = await fetch("/api/ext/headless-sync/create-remote-vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            encryption,
            password: password || void 0,
            region: region || void 0
          })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Request failed: ${res.status}`);
        }
        dispatch2("created");
      } catch (e) {
        $$invalidate(5, error = e.message);
        $$invalidate(4, creating = false);
      }
    }
    function onBack() {
      dispatch2("back");
    }
    function input_input_handler() {
      name = this.value;
      $$invalidate(0, name);
    }
    function select0_change_handler() {
      region = select_value(this);
      $$invalidate(1, region);
    }
    function select1_change_handler() {
      encryption = select_value(this);
      $$invalidate(2, encryption);
    }
    function input_input_handler_1() {
      password = this.value;
      $$invalidate(3, password);
    }
    return [
      name,
      region,
      encryption,
      password,
      creating,
      error,
      onSubmit,
      onBack,
      input_input_handler,
      select0_change_handler,
      select1_change_handler,
      input_input_handler_1
    ];
  }
  var CreateVaultForm = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance45, create_fragment45, safe_not_equal, {}, add_css19);
    }
  };
  var CreateVaultForm_default = CreateVaultForm;

  // packages/ui/src/views/SyncSetupModal.svelte
  function add_css20(target) {
    append_styles(target, "svelte-bv1sbq", ".sync-setup-body.svelte-bv1sbq.svelte-bv1sbq{padding:1.25rem 1.5rem;overflow-y:auto}.sync-setup-desc.svelte-bv1sbq.svelte-bv1sbq{color:var(--text-muted);font-size:0.875rem;margin:0 0 1rem;line-height:1.4}.sync-setup-error.svelte-bv1sbq.svelte-bv1sbq{color:var(--text-error);font-size:0.875rem}.sync-setup-error.svelte-bv1sbq p.svelte-bv1sbq{margin:0 0 0.5rem}.retry-btn.svelte-bv1sbq.svelte-bv1sbq{font-family:var(--font-interface);font-size:0.8125rem;padding:0.25rem 0.75rem;border:1px solid var(--background-modifier-border);border-radius:0.375rem;background:none;color:var(--text-muted);cursor:pointer}.retry-btn.svelte-bv1sbq.svelte-bv1sbq:hover{color:var(--text-normal);background:var(--background-modifier-hover)}");
  }
  function create_else_block_12(ctx) {
    let p;
    let t1;
    let createvaultform;
    let current;
    createvaultform = new CreateVaultForm_default({});
    createvaultform.$on(
      "created",
      /*onCreated*/
      ctx[7]
    );
    createvaultform.$on(
      "back",
      /*back_handler*/
      ctx[12]
    );
    return {
      c() {
        p = element("p");
        p.textContent = "Create a new remote vault on Obsidian Sync.";
        t1 = space();
        create_component(createvaultform.$$.fragment);
        attr(p, "class", "sync-setup-desc svelte-bv1sbq");
      },
      m(target, anchor) {
        insert(target, p, anchor);
        insert(target, t1, anchor);
        mount_component(createvaultform, target, anchor);
        current = true;
      },
      p: noop,
      i(local) {
        if (current)
          return;
        transition_in(createvaultform.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(createvaultform.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(p);
          detach(t1);
        }
        destroy_component(createvaultform, detaching);
      }
    };
  }
  function create_if_block16(ctx) {
    let p;
    let t1;
    let current_block_type_index;
    let if_block;
    let if_block_anchor;
    let current;
    const if_block_creators = [create_if_block_112, create_else_block7];
    const if_blocks = [];
    function select_block_type_1(ctx2, dirty) {
      if (
        /*error*/
        ctx2[4]
      )
        return 0;
      return 1;
    }
    current_block_type_index = select_block_type_1(ctx, -1);
    if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    return {
      c() {
        p = element("p");
        p.textContent = "Link this vault to an Obsidian Sync remote vault for server-side synchronization.";
        t1 = space();
        if_block.c();
        if_block_anchor = empty();
        attr(p, "class", "sync-setup-desc svelte-bv1sbq");
      },
      m(target, anchor) {
        insert(target, p, anchor);
        insert(target, t1, anchor);
        if_blocks[current_block_type_index].m(target, anchor);
        insert(target, if_block_anchor, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        let previous_block_index = current_block_type_index;
        current_block_type_index = select_block_type_1(ctx2, dirty);
        if (current_block_type_index === previous_block_index) {
          if_blocks[current_block_type_index].p(ctx2, dirty);
        } else {
          group_outros();
          transition_out(if_blocks[previous_block_index], 1, 1, () => {
            if_blocks[previous_block_index] = null;
          });
          check_outros();
          if_block = if_blocks[current_block_type_index];
          if (!if_block) {
            if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx2);
            if_block.c();
          } else {
            if_block.p(ctx2, dirty);
          }
          transition_in(if_block, 1);
          if_block.m(if_block_anchor.parentNode, if_block_anchor);
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(if_block);
        current = true;
      },
      o(local) {
        transition_out(if_block);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(p);
          detach(t1);
          detach(if_block_anchor);
        }
        if_blocks[current_block_type_index].d(detaching);
      }
    };
  }
  function create_else_block7(ctx) {
    let vaultlist;
    let current;
    vaultlist = new VaultList_default({
      props: {
        vaults: (
          /*vaults*/
          ctx[2]
        ),
        loading: (
          /*loading*/
          ctx[3]
        )
      }
    });
    vaultlist.$on(
      "link",
      /*onLink*/
      ctx[6]
    );
    vaultlist.$on(
      "create",
      /*create_handler*/
      ctx[11]
    );
    return {
      c() {
        create_component(vaultlist.$$.fragment);
      },
      m(target, anchor) {
        mount_component(vaultlist, target, anchor);
        current = true;
      },
      p(ctx2, dirty) {
        const vaultlist_changes = {};
        if (dirty & /*vaults*/
        4)
          vaultlist_changes.vaults = /*vaults*/
          ctx2[2];
        if (dirty & /*loading*/
        8)
          vaultlist_changes.loading = /*loading*/
          ctx2[3];
        vaultlist.$set(vaultlist_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(vaultlist.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(vaultlist.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        destroy_component(vaultlist, detaching);
      }
    };
  }
  function create_if_block_112(ctx) {
    let div;
    let p;
    let t0;
    let t1;
    let t2;
    let button;
    let mounted;
    let dispose;
    return {
      c() {
        div = element("div");
        p = element("p");
        t0 = text("Failed to load remote vaults: ");
        t1 = text(
          /*error*/
          ctx[4]
        );
        t2 = space();
        button = element("button");
        button.textContent = "Retry";
        attr(p, "class", "svelte-bv1sbq");
        attr(button, "class", "retry-btn svelte-bv1sbq");
        attr(div, "class", "sync-setup-error svelte-bv1sbq");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, p);
        append(p, t0);
        append(p, t1);
        append(div, t2);
        append(div, button);
        if (!mounted) {
          dispose = listen(
            button,
            "click",
            /*fetchVaults*/
            ctx[5]
          );
          mounted = true;
        }
      },
      p(ctx2, dirty) {
        if (dirty & /*error*/
        16)
          set_data(
            t1,
            /*error*/
            ctx2[4]
          );
      },
      i: noop,
      o: noop,
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        mounted = false;
        dispose();
      }
    };
  }
  function create_default_slot39(ctx) {
    let div;
    let current_block_type_index;
    let if_block;
    let current;
    const if_block_creators = [create_if_block16, create_else_block_12];
    const if_blocks = [];
    function select_block_type(ctx2, dirty) {
      if (
        /*view*/
        ctx2[1] === "list"
      )
        return 0;
      return 1;
    }
    current_block_type_index = select_block_type(ctx, -1);
    if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    return {
      c() {
        div = element("div");
        if_block.c();
        attr(div, "class", "sync-setup-body svelte-bv1sbq");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        if_blocks[current_block_type_index].m(div, null);
        current = true;
      },
      p(ctx2, dirty) {
        let previous_block_index = current_block_type_index;
        current_block_type_index = select_block_type(ctx2, dirty);
        if (current_block_type_index === previous_block_index) {
          if_blocks[current_block_type_index].p(ctx2, dirty);
        } else {
          group_outros();
          transition_out(if_blocks[previous_block_index], 1, 1, () => {
            if_blocks[previous_block_index] = null;
          });
          check_outros();
          if_block = if_blocks[current_block_type_index];
          if (!if_block) {
            if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx2);
            if_block.c();
          } else {
            if_block.p(ctx2, dirty);
          }
          transition_in(if_block, 1);
          if_block.m(div, null);
        }
      },
      i(local) {
        if (current)
          return;
        transition_in(if_block);
        current = true;
      },
      o(local) {
        transition_out(if_block);
        current = false;
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        if_blocks[current_block_type_index].d();
      }
    };
  }
  function create_fragment46(ctx) {
    let modal;
    let current;
    let modal_props = {
      title: (
        /*view*/
        ctx[1] === "list" ? "Set up Headless Sync" : "Create new remote vault"
      ),
      width: "550px",
      $$slots: { default: [create_default_slot39] },
      $$scope: { ctx }
    };
    modal = new Modal_default({ props: modal_props });
    ctx[13](modal);
    modal.$on(
      "close",
      /*onClose*/
      ctx[8]
    );
    modal.$on(
      "escape",
      /*onClose*/
      ctx[8]
    );
    return {
      c() {
        create_component(modal.$$.fragment);
      },
      m(target, anchor) {
        mount_component(modal, target, anchor);
        current = true;
      },
      p(ctx2, [dirty]) {
        const modal_changes = {};
        if (dirty & /*view*/
        2)
          modal_changes.title = /*view*/
          ctx2[1] === "list" ? "Set up Headless Sync" : "Create new remote vault";
        if (dirty & /*$$scope, error, vaults, loading, view*/
        32798) {
          modal_changes.$$scope = { dirty, ctx: ctx2 };
        }
        modal.$set(modal_changes);
      },
      i(local) {
        if (current)
          return;
        transition_in(modal.$$.fragment, local);
        current = true;
      },
      o(local) {
        transition_out(modal.$$.fragment, local);
        current = false;
      },
      d(detaching) {
        ctx[13](null);
        destroy_component(modal, detaching);
      }
    };
  }
  function instance46($$self, $$props, $$invalidate) {
    let { vaultId } = $$props;
    let { onSuccess = null } = $$props;
    const dispatch2 = createEventDispatcher();
    let modalRef;
    let view = "list";
    let vaults = [];
    let loading = true;
    let error = "";
    onMount(() => {
      fetchVaults();
    });
    async function fetchVaults() {
      $$invalidate(3, loading = true);
      $$invalidate(4, error = "");
      try {
        const res = await fetch("/api/ext/headless-sync/remote-vaults");
        if (!res.ok) {
          const data2 = await res.json().catch(() => ({}));
          throw new Error(data2.error || `Request failed: ${res.status}`);
        }
        const data = await res.json();
        $$invalidate(2, vaults = data.vaults);
      } catch (e) {
        $$invalidate(4, error = e.message);
      }
      $$invalidate(3, loading = false);
    }
    async function onLink(e) {
      const { vault, vaultPassword, deviceName, mode } = e.detail;
      $$invalidate(4, error = "");
      try {
        const res = await fetch("/api/ext/headless-sync/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vaultId,
            remoteVault: vault.id,
            remoteVaultName: vault.name,
            vaultPassword,
            deviceName,
            mode
          })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Request failed: ${res.status}`);
        }
        if (onSuccess) {
          onSuccess();
        }
        modalRef.dismiss();
      } catch (e2) {
        $$invalidate(4, error = e2.message);
      }
    }
    function onCreated() {
      $$invalidate(1, view = "list");
      fetchVaults();
    }
    function onClose() {
      dispatch2("close");
    }
    const create_handler = () => $$invalidate(1, view = "create");
    const back_handler = () => $$invalidate(1, view = "list");
    function modal_binding($$value) {
      binding_callbacks[$$value ? "unshift" : "push"](() => {
        modalRef = $$value;
        $$invalidate(0, modalRef);
      });
    }
    $$self.$$set = ($$props2) => {
      if ("vaultId" in $$props2)
        $$invalidate(9, vaultId = $$props2.vaultId);
      if ("onSuccess" in $$props2)
        $$invalidate(10, onSuccess = $$props2.onSuccess);
    };
    return [
      modalRef,
      view,
      vaults,
      loading,
      error,
      fetchVaults,
      onLink,
      onCreated,
      onClose,
      vaultId,
      onSuccess,
      create_handler,
      back_handler,
      modal_binding
    ];
  }
  var SyncSetupModal = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance46, create_fragment46, safe_not_equal, { vaultId: 9, onSuccess: 10 }, add_css20);
    }
  };
  var SyncSetupModal_default = SyncSetupModal;

  // packages/ui/src/views/agent/chat-renderer.js
  function escapeHtml(text2) {
    return text2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escapeAttr(text2) {
    return text2.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function parseMarkdown(text2) {
    if (!text2)
      return "";
    let html = escapeHtml(text2);
    html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(?<!\w)\*([^*\n]+?)\*(?!\w)/g, "<em>$1</em>");
    html = html.replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, "<em>$1</em>");
    html = html.replace(/`([^`\n]+?)`/g, "<code>$1</code>");
    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text3, url) => {
      return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(text3)}</a>`;
    });
    html = html.replace(/^---$/gm, "<hr>");
    html = html.replace(/^([*-]) (.+)$/gm, "<li>$2</li>");
    html = html.replace(/^\d+\. (.+)$/gm, "<li>$2</li>");
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, (block) => {
      const isOrdered = block.match(/^<li>(\d+)\./) !== null;
      return `
<${isOrdered ? "ol" : "ul"}>
${block.trim()}
</${isOrdered ? "ol" : "ul"}>
`;
    });
    const blocks = html.split(/\n\n+/);
    html = blocks.map((b) => {
      const trimmed = b.trim();
      if (!trimmed)
        return "";
      if (/^<(h[234]|ul|ol|hr|li)/.test(trimmed))
        return trimmed;
      return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
    }).join("\n");
    return html;
  }
  function resolveSourceLink(source) {
    const title = source.title || source.doc_id;
    const displayText = escapeHtml(title);
    let extra = "";
    if (source.page !== void 0 && source.page !== null) {
      extra += ` (\u0441\u0442\u0440. ${source.page})`;
    }
    if (source.section) {
      extra += ` (\u0440\u0430\u0437\u0434\u0435\u043B ${source.section})`;
    }
    let quoteAttr = "";
    if (source.quote) {
      quoteAttr = ` data-quote="${escapeAttr(source.quote)}"`;
    }
    return `<a class="agent-link" data-path="${escapeAttr(source.path)}"${quoteAttr} title="${displayText}">${displayText}</a>${extra}`;
  }
  function renderResponse(response) {
    let html = "";
    html += `<div class="agent-block agent-block--answer">${parseMarkdown(response.answer)}</div>`;
    if (response.entities && response.entities.length > 0) {
      const items = response.entities.map(
        (e) => `<span class="agent-entity agent-entity--${e.type}">${escapeHtml(e.name)}</span>`
      ).join("");
      html += `<div class="agent-block agent-block--entities">
      <div class="agent-block-label">\u0421\u0443\u0449\u043D\u043E\u0441\u0442\u0438 (${response.entities.length})</div>
      <div class="agent-entity-list">${items}</div>
    </div>`;
    }
    if (response.relations && response.relations.length > 0) {
      const items = response.relations.map(
        (r) => `<div class="agent-relation">${escapeHtml(r.from)} <span class="agent-relation-type">${escapeHtml(r.type)}</span> ${escapeHtml(r.to)}</div>`
      ).join("");
      html += `<div class="agent-block agent-block--relations">
      <div class="agent-block-label">\u0421\u0432\u044F\u0437\u0438 (${response.relations.length})</div>
      <div class="agent-relation-list">${items}</div>
    </div>`;
    }
    if (response.sources && response.sources.length > 0) {
      const items = response.sources.map((s) => {
        const link = resolveSourceLink(s);
        const excerpt = escapeHtml(s.excerpt);
        return `<div class="agent-source">
          <div class="agent-source-link">${link}</div>
          <div class="agent-source-excerpt">${excerpt}</div>
        </div>`;
      }).join("");
      html += `<div class="agent-block agent-block--sources">
      <div class="agent-block-label">\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438 (${response.sources.length})</div>
      <div class="agent-source-list">${items}</div>
    </div>`;
    }
    if (response.gaps && response.gaps.length > 0) {
      const items = response.gaps.map(
        (g) => `<div class="agent-gap">
            <div class="agent-gap-icon">&#9888;</div>
            <div class="agent-gap-text">${escapeHtml(g.description)}</div>
          </div>`
      ).join("");
      html += `<div class="agent-block agent-block--gaps">
      <div class="agent-block-label">\u041F\u0440\u043E\u0431\u0435\u043B\u044B \u0432 \u0434\u0430\u043D\u043D\u044B\u0445 (${response.gaps.length})</div>
      <div class="agent-gap-list">${items}</div>
    </div>`;
    }
    return html;
  }
  var LABEL_TO_TYPE = {
    Material: "material",
    Process: "experiment",
    Equipment: "equipment",
    Experiment: "experiment",
    Parameter: "property",
    Expert: "team",
    Claim: "topic",
    Facility: "equipment",
    Document: "topic"
  };
  var ENTITY_LIMIT = 30;
  function rankEntities(entityNodes, edges) {
    const degree = {};
    for (const e of edges) {
      degree[e.from] = (degree[e.from] || 0) + 1;
      degree[e.to] = (degree[e.to] || 0) + 1;
    }
    return entityNodes.map((n) => ({ ...n, _deg: degree[n.key] || 0 })).sort((a2, b) => b._deg - a2._deg || (a2.name || "").localeCompare(b.name || ""));
  }
  function renderFromBackend(answerText, subgraph, citations, backendSources) {
    let html = "";
    if (answerText) {
      html += `<div class="agent-block agent-block--answer">${parseMarkdown(answerText)}</div>`;
    }
    const nodes = (subgraph == null ? void 0 : subgraph.nodes) || [];
    const edges = (subgraph == null ? void 0 : subgraph.edges) || [];
    const entityNodes = nodes.filter(
      (n) => n.label !== "Document" && n.label !== "Chunk"
    );
    if (entityNodes.length > 0) {
      const ranked = rankEntities(entityNodes, edges);
      const display = ranked.slice(0, ENTITY_LIMIT);
      const hidden = ranked.length - display.length;
      const items = display.map((n) => {
        const type2 = LABEL_TO_TYPE[n.label] || "topic";
        return `<span class="agent-entity agent-entity--${type2}">${escapeHtml(n.name || n.key)}</span>`;
      }).join("");
      let label = `\u0421\u0443\u0449\u043D\u043E\u0441\u0442\u0438 (${display.length}`;
      if (hidden > 0)
        label += ` \u0438\u0437 ${ranked.length}`;
      label += ")";
      html += `<div class="agent-block agent-block--entities">
      <div class="agent-block-label">${label}</div>
      <div class="agent-entity-list">${items}</div>
    </div>`;
    }
    const sources = backendSources || [];
    if (sources.length > 0) {
      const items = sources.map((s) => {
        const link = resolveSourceLink(s);
        const excerpt = escapeHtml(s.quote || s.excerpt || "");
        return `<div class="agent-source">
          <div class="agent-source-link">${link}</div>
          ${excerpt ? `<div class="agent-source-excerpt">${excerpt}</div>` : ""}
        </div>`;
      }).join("");
      html += `<div class="agent-block agent-block--sources">
      <div class="agent-block-label">\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438 (${sources.length})</div>
      <div class="agent-source-list">${items}</div>
    </div>`;
    }
    const gapNodes = nodes.filter((n) => n.is_gap);
    if (gapNodes.length > 0) {
      const items = gapNodes.map(
        (n) => {
          var _a;
          return `<div class="agent-gap">
            <div class="agent-gap-icon">&#9888;</div>
            <div class="agent-gap-text">${escapeHtml(n.name || n.key)}: ${escapeHtml(((_a = n.props) == null ? void 0 : _a.description) || "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445")}</div>
          </div>`;
        }
      ).join("");
      html += `<div class="agent-block agent-block--gaps">
      <div class="agent-block-label">\u041F\u0440\u043E\u0431\u0435\u043B\u044B \u0432 \u0434\u0430\u043D\u043D\u044B\u0445 (${gapNodes.length})</div>
      <div class="agent-gap-list">${items}</div>
    </div>`;
    }
    return html;
  }

  // packages/ui/src/views/agent/ChatView.svelte
  function add_css21(target) {
    append_styles(target, "svelte-15k88kk", ".agent-chat-container{display:flex;flex-direction:column;height:100%;overflow:hidden}.agent-chat-header{padding:8px 12px;border-bottom:1px solid var(--background-modifier-border);flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px}.agent-chat-header-left{display:flex;align-items:center;gap:8px;min-width:0}.agent-chat-header h3{margin:0;font-size:0.95em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.agent-chat-sessions-btn{background:none;border:none;color:var(--text-muted);cursor:pointer;width:28px;height:28px;padding:0;border-radius:4px;display:flex;align-items:center;justify-content:center;flex-shrink:0}.agent-chat-sessions-btn:hover{color:var(--text-normal);background:var(--background-modifier-hover)}.agent-chat-new-btn{background:none;border:none;color:var(--text-muted);cursor:pointer;width:28px;height:28px;padding:0;border-radius:4px;display:flex;align-items:center;justify-content:center;flex-shrink:0}.agent-chat-new-btn:hover{color:var(--text-accent);background:var(--background-modifier-hover)}.agent-chat-body{display:flex;flex:1;min-height:0}.agent-sessions-panel{width:220px;flex-shrink:0;border-right:1px solid var(--background-modifier-border);display:flex;flex-direction:column;overflow:hidden}.agent-sessions-panel-header{padding:8px 12px;font-size:0.8em;font-weight:600;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.05em;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--background-modifier-border)}.agent-sessions-list{flex:1;overflow-y:auto;padding:4px}.agent-session-item{padding:8px 10px;border-radius:6px;cursor:pointer;position:relative}.agent-session-item:hover{background:var(--background-modifier-hover)}.agent-session-item.active{background:var(--background-modifier-hover)}.agent-session-item-title{font-size:0.85em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:20px}.agent-session-item-meta{font-size:0.72em;color:var(--text-muted);display:flex;gap:8px;margin-top:2px}.agent-session-delete{position:absolute;top:8px;right:6px;background:none;border:none;color:var(--text-muted);cursor:pointer;padding:2px;border-radius:3px;display:none}.agent-session-item:hover .agent-session-delete{display:flex}.agent-session-delete:hover{color:var(--text-error);background:var(--background-modifier-error)}.agent-chat-messages{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:12px;user-select:text;-webkit-user-select:text}.agent-chat-placeholder{color:var(--text-muted);text-align:center;padding:24px 0;font-style:italic}.agent-chat-message{border-radius:8px;padding:8px 12px;max-width:90%;user-select:text;-webkit-user-select:text}.agent-chat-message--user{align-self:flex-end;background-color:var(--interactive-accent);color:var(--text-on-accent)}.agent-chat-message--agent{align-self:flex-start;background-color:var(--background-modifier-hover);border:1px solid var(--background-modifier-border);max-width:95%}.agent-chat-message--error{align-self:center;background-color:var(--background-modifier-error);color:var(--text-error);font-size:0.85em}.agent-chat-message-header{font-size:0.75em;opacity:0.7;margin-bottom:4px}.agent-chat-message-role{font-weight:600}.agent-chat-message-body{font-size:0.9em;line-height:1.5;word-break:break-word}.agent-chat-message-body a{color:var(--link-color);text-decoration:none}.agent-chat-message-body a:hover{text-decoration:underline}.agent-chat-loading{align-self:flex-start;color:var(--text-muted);font-style:italic;font-size:0.85em;padding:8px 12px}.agent-block{margin-top:10px}.agent-block--answer{margin-top:0}.agent-block--answer h2,.agent-block--answer h3,.agent-block--answer h4{margin:10px 0 4px;font-size:1em}.agent-block--answer h3{font-weight:700}.agent-block--answer h4{font-weight:600}.agent-block--answer p{margin:4px 0}.agent-block--answer ul,.agent-block--answer ol{margin:4px 0;padding-left:20px}.agent-block--answer li{margin:2px 0}.agent-block--answer code{background:var(--background-modifier-border);padding:1px 4px;border-radius:3px;font-size:0.85em}.agent-block--answer strong{font-weight:700}.agent-block--answer em{font-style:italic}.agent-block--answer hr{border:none;border-top:1px solid var(--background-modifier-border);margin:8px 0}.agent-block--answer a{color:var(--link-color);text-decoration:underline}.agent-block-label{font-weight:600;font-size:0.8em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;letter-spacing:0.05em}.agent-entity-list{display:flex;flex-wrap:wrap;gap:4px}.agent-entity{display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.82em;font-weight:500}.agent-entity--material{background:rgba(78, 121, 167, 0.15);color:var(--text-accent)}.agent-entity--experiment{background:rgba(89, 161, 79, 0.15);color:#59a14f}.agent-entity--property{background:rgba(237, 201, 72, 0.15);color:#c9a90e}.agent-entity--regime{background:rgba(225, 87, 89, 0.15);color:#e15759}.agent-entity--equipment{background:rgba(178, 126, 197, 0.15);color:#b07cc5}.agent-entity--team{background:rgba(242, 142, 44, 0.15);color:#f28e2c}.agent-entity--topic{background:rgba(118, 183, 178, 0.15);color:#76b7b2}.agent-relation-list{font-size:0.85em}.agent-relation{padding:2px 0}.agent-relation-type{color:var(--text-accent);font-style:italic}.agent-source-list{display:flex;flex-direction:column;gap:6px}.agent-source{padding:6px 8px;border-left:3px solid var(--interactive-accent);background:var(--background-primary);border-radius:0 4px 4px 0}.agent-source-link{margin-bottom:2px}.agent-link{color:var(--link-color);cursor:pointer;text-decoration:underline;font-weight:500}.agent-link:hover{color:var(--link-color-hover)}.agent-source-excerpt{font-size:0.82em;color:var(--text-muted);font-style:italic}.agent-gap-list{display:flex;flex-direction:column;gap:4px}.agent-gap{display:flex;gap:6px;padding:4px 0;font-size:0.85em}.agent-gap-icon{flex-shrink:0;color:var(--text-warning)}.agent-gap-text{color:var(--text-muted)}.agent-chat-input-area{padding:8px 12px;border-top:1px solid var(--background-modifier-border);display:flex;gap:8px;flex-shrink:0}.agent-chat-input{flex:1;resize:none;border-radius:6px;padding:8px;font-size:0.9em;background:var(--background-primary);color:var(--text-normal);border:1px solid var(--background-modifier-border);font-family:inherit}.agent-chat-input:focus{outline:none;border-color:var(--interactive-accent)}.agent-chat-send-button{align-self:flex-end;padding:8px 16px;border-radius:6px;border:none;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-weight:600;font-size:0.9em}.agent-chat-send-button:hover{opacity:0.85}.agent-open-graph-btn{display:block;margin-top:10px;padding:6px 14px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-accent);cursor:pointer;font-size:0.82em;font-weight:500}.agent-open-graph-btn:hover{background:var(--background-modifier-hover)}.agent-loading-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--text-muted);margin-right:3px;animation:svelte-15k88kk-agent-dot-pulse 1.4s ease-in-out infinite both}.agent-loading-dot:nth-child(1){animation-delay:0s}.agent-loading-dot:nth-child(2){animation-delay:0.2s}.agent-loading-dot:nth-child(3){animation-delay:0.4s}@keyframes svelte-15k88kk-agent-dot-pulse{0%,80%,100%{opacity:0.2;transform:scale(0.8)}40%{opacity:1;transform:scale(1.1)}}.agent-cursor{animation:svelte-15k88kk-agent-blink 1s step-end infinite;color:var(--interactive-accent);font-weight:700}@keyframes svelte-15k88kk-agent-blink{50%{opacity:0}}");
  }
  function get_each_context10(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[37] = list[i];
    return child_ctx;
  }
  function get_each_context_14(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[40] = list[i];
    return child_ctx;
  }
  function create_if_block_74(ctx) {
    let div2;
    let div0;
    let span;
    let t1;
    let button;
    let t2;
    let div1;
    let each_blocks = [];
    let each_1_lookup = /* @__PURE__ */ new Map();
    let mounted;
    let dispose;
    let each_value_1 = ensure_array_like(
      /*sessions*/
      ctx[7]
    );
    const get_key = (ctx2) => (
      /*s*/
      ctx2[40].id
    );
    for (let i = 0; i < each_value_1.length; i += 1) {
      let child_ctx = get_each_context_14(ctx, each_value_1, i);
      let key = get_key(child_ctx);
      each_1_lookup.set(key, each_blocks[i] = create_each_block_14(key, child_ctx));
    }
    return {
      c() {
        div2 = element("div");
        div0 = element("div");
        span = element("span");
        span.textContent = "Sessions";
        t1 = space();
        button = element("button");
        button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        t2 = space();
        div1 = element("div");
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        attr(button, "class", "agent-chat-new-btn");
        attr(button, "title", "New Chat");
        attr(div0, "class", "agent-sessions-panel-header");
        attr(div1, "class", "agent-sessions-list");
        attr(div2, "class", "agent-sessions-panel");
      },
      m(target, anchor) {
        insert(target, div2, anchor);
        append(div2, div0);
        append(div0, span);
        append(div0, t1);
        append(div0, button);
        append(div2, t2);
        append(div2, div1);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(div1, null);
          }
        }
        if (!mounted) {
          dispose = listen(
            button,
            "click",
            /*newChat*/
            ctx[11]
          );
          mounted = true;
        }
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*sessions, currentSessionId, loadSession, deleteSession*/
        1672) {
          each_value_1 = ensure_array_like(
            /*sessions*/
            ctx2[7]
          );
          each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx2, each_value_1, each_1_lookup, div1, destroy_block, create_each_block_14, null, get_each_context_14);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(div2);
        }
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].d();
        }
        mounted = false;
        dispose();
      }
    };
  }
  function create_each_block_14(key_1, ctx) {
    let div2;
    let div0;
    let t0_value = (
      /*s*/
      (ctx[40].title || "Untitled") + ""
    );
    let t0;
    let t1;
    let div1;
    let span0;
    let t2_value = (
      /*s*/
      ctx[40].messageCount + ""
    );
    let t2;
    let t3;
    let t4;
    let span1;
    let t5_value = formatDate(
      /*s*/
      ctx[40].updatedAt
    ) + "";
    let t5;
    let t6;
    let button;
    let t7;
    let mounted;
    let dispose;
    function click_handler(...args) {
      return (
        /*click_handler*/
        ctx[20](
          /*s*/
          ctx[40],
          ...args
        )
      );
    }
    function click_handler_1() {
      return (
        /*click_handler_1*/
        ctx[21](
          /*s*/
          ctx[40]
        )
      );
    }
    function keydown_handler(...args) {
      return (
        /*keydown_handler*/
        ctx[22](
          /*s*/
          ctx[40],
          ...args
        )
      );
    }
    return {
      key: key_1,
      first: null,
      c() {
        div2 = element("div");
        div0 = element("div");
        t0 = text(t0_value);
        t1 = space();
        div1 = element("div");
        span0 = element("span");
        t2 = text(t2_value);
        t3 = text(" msg");
        t4 = space();
        span1 = element("span");
        t5 = text(t5_value);
        t6 = space();
        button = element("button");
        button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        t7 = space();
        attr(div0, "class", "agent-session-item-title");
        attr(div1, "class", "agent-session-item-meta");
        attr(button, "class", "agent-session-delete");
        attr(button, "title", "Delete");
        attr(div2, "class", "agent-session-item");
        attr(div2, "role", "button");
        attr(div2, "tabindex", "0");
        toggle_class(
          div2,
          "active",
          /*s*/
          ctx[40].id === /*currentSessionId*/
          ctx[3]
        );
        this.first = div2;
      },
      m(target, anchor) {
        insert(target, div2, anchor);
        append(div2, div0);
        append(div0, t0);
        append(div2, t1);
        append(div2, div1);
        append(div1, span0);
        append(span0, t2);
        append(span0, t3);
        append(div1, t4);
        append(div1, span1);
        append(span1, t5);
        append(div2, t6);
        append(div2, button);
        append(div2, t7);
        if (!mounted) {
          dispose = [
            listen(button, "click", click_handler),
            listen(div2, "click", click_handler_1),
            listen(div2, "keydown", keydown_handler)
          ];
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (dirty[0] & /*sessions*/
        128 && t0_value !== (t0_value = /*s*/
        (ctx[40].title || "Untitled") + ""))
          set_data(t0, t0_value);
        if (dirty[0] & /*sessions*/
        128 && t2_value !== (t2_value = /*s*/
        ctx[40].messageCount + ""))
          set_data(t2, t2_value);
        if (dirty[0] & /*sessions*/
        128 && t5_value !== (t5_value = formatDate(
          /*s*/
          ctx[40].updatedAt
        ) + ""))
          set_data(t5, t5_value);
        if (dirty[0] & /*sessions, currentSessionId*/
        136) {
          toggle_class(
            div2,
            "active",
            /*s*/
            ctx[40].id === /*currentSessionId*/
            ctx[3]
          );
        }
      },
      d(detaching) {
        if (detaching) {
          detach(div2);
        }
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function create_if_block_64(ctx) {
    let div;
    return {
      c() {
        div = element("div");
        div.textContent = `${PLACEHOLDER}`;
        attr(div, "class", "agent-chat-placeholder");
      },
      m(target, anchor) {
        insert(target, div, anchor);
      },
      p: noop,
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_if_block_54(ctx) {
    let div1;
    let div0;
    let t_value = (
      /*msg*/
      ctx[37].content + ""
    );
    let t;
    return {
      c() {
        div1 = element("div");
        div0 = element("div");
        t = text(t_value);
        attr(div0, "class", "agent-chat-message-body");
        attr(div1, "class", "agent-chat-message agent-chat-message--error");
      },
      m(target, anchor) {
        insert(target, div1, anchor);
        append(div1, div0);
        append(div0, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*messages*/
        2 && t_value !== (t_value = /*msg*/
        ctx2[37].content + ""))
          set_data(t, t_value);
      },
      d(detaching) {
        if (detaching) {
          detach(div1);
        }
      }
    };
  }
  function create_if_block_38(ctx) {
    let div2;
    let div0;
    let t1;
    let div1;
    let raw_value = (
      /*msg*/
      ctx[37].html + ""
    );
    let t2;
    let if_block = (
      /*msg*/
      ctx[37].subgraph && create_if_block_46(ctx)
    );
    return {
      c() {
        div2 = element("div");
        div0 = element("div");
        div0.innerHTML = `<span class="agent-chat-message-role">Agent</span>`;
        t1 = space();
        div1 = element("div");
        t2 = space();
        if (if_block)
          if_block.c();
        attr(div0, "class", "agent-chat-message-header");
        attr(div1, "class", "agent-chat-message-body");
        attr(div2, "class", "agent-chat-message agent-chat-message--agent");
      },
      m(target, anchor) {
        insert(target, div2, anchor);
        append(div2, div0);
        append(div2, t1);
        append(div2, div1);
        div1.innerHTML = raw_value;
        append(div2, t2);
        if (if_block)
          if_block.m(div2, null);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*messages*/
        2 && raw_value !== (raw_value = /*msg*/
        ctx2[37].html + ""))
          div1.innerHTML = raw_value;
        ;
        if (
          /*msg*/
          ctx2[37].subgraph
        ) {
          if (if_block) {
            if_block.p(ctx2, dirty);
          } else {
            if_block = create_if_block_46(ctx2);
            if_block.c();
            if_block.m(div2, null);
          }
        } else if (if_block) {
          if_block.d(1);
          if_block = null;
        }
      },
      d(detaching) {
        if (detaching) {
          detach(div2);
        }
        if (if_block)
          if_block.d();
      }
    };
  }
  function create_if_block_29(ctx) {
    let div1;
    let div0;
    let t_value = (
      /*msg*/
      ctx[37].content + ""
    );
    let t;
    return {
      c() {
        div1 = element("div");
        div0 = element("div");
        t = text(t_value);
        attr(div0, "class", "agent-chat-message-body");
        attr(div1, "class", "agent-chat-message agent-chat-message--user");
      },
      m(target, anchor) {
        insert(target, div1, anchor);
        append(div1, div0);
        append(div0, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*messages*/
        2 && t_value !== (t_value = /*msg*/
        ctx2[37].content + ""))
          set_data(t, t_value);
      },
      d(detaching) {
        if (detaching) {
          detach(div1);
        }
      }
    };
  }
  function create_if_block_46(ctx) {
    let button;
    let mounted;
    let dispose;
    function click_handler_2() {
      return (
        /*click_handler_2*/
        ctx[23](
          /*msg*/
          ctx[37]
        )
      );
    }
    return {
      c() {
        button = element("button");
        button.textContent = "Open Graph";
        attr(button, "class", "agent-open-graph-btn");
      },
      m(target, anchor) {
        insert(target, button, anchor);
        if (!mounted) {
          dispose = listen(button, "click", click_handler_2);
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
      },
      d(detaching) {
        if (detaching) {
          detach(button);
        }
        mounted = false;
        dispose();
      }
    };
  }
  function create_each_block10(key_1, ctx) {
    let first;
    let if_block_anchor;
    function select_block_type(ctx2, dirty) {
      if (
        /*msg*/
        ctx2[37].role === "user"
      )
        return create_if_block_29;
      if (
        /*msg*/
        ctx2[37].role === "agent"
      )
        return create_if_block_38;
      if (
        /*msg*/
        ctx2[37].role === "error"
      )
        return create_if_block_54;
    }
    let current_block_type = select_block_type(ctx, [-1, -1]);
    let if_block = current_block_type && current_block_type(ctx);
    return {
      key: key_1,
      first: null,
      c() {
        first = empty();
        if (if_block)
          if_block.c();
        if_block_anchor = empty();
        this.first = first;
      },
      m(target, anchor) {
        insert(target, first, anchor);
        if (if_block)
          if_block.m(target, anchor);
        insert(target, if_block_anchor, anchor);
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (current_block_type === (current_block_type = select_block_type(ctx, dirty)) && if_block) {
          if_block.p(ctx, dirty);
        } else {
          if (if_block)
            if_block.d(1);
          if_block = current_block_type && current_block_type(ctx);
          if (if_block) {
            if_block.c();
            if_block.m(if_block_anchor.parentNode, if_block_anchor);
          }
        }
      },
      d(detaching) {
        if (detaching) {
          detach(first);
          detach(if_block_anchor);
        }
        if (if_block) {
          if_block.d(detaching);
        }
      }
    };
  }
  function create_if_block17(ctx) {
    let if_block_anchor;
    function select_block_type_1(ctx2, dirty) {
      if (
        /*loadingHtml*/
        ctx2[0]
      )
        return create_if_block_113;
      return create_else_block8;
    }
    let current_block_type = select_block_type_1(ctx, [-1, -1]);
    let if_block = current_block_type(ctx);
    return {
      c() {
        if_block.c();
        if_block_anchor = empty();
      },
      m(target, anchor) {
        if_block.m(target, anchor);
        insert(target, if_block_anchor, anchor);
      },
      p(ctx2, dirty) {
        if (current_block_type === (current_block_type = select_block_type_1(ctx2, dirty)) && if_block) {
          if_block.p(ctx2, dirty);
        } else {
          if_block.d(1);
          if_block = current_block_type(ctx2);
          if (if_block) {
            if_block.c();
            if_block.m(if_block_anchor.parentNode, if_block_anchor);
          }
        }
      },
      d(detaching) {
        if (detaching) {
          detach(if_block_anchor);
        }
        if_block.d(detaching);
      }
    };
  }
  function create_else_block8(ctx) {
    let div;
    return {
      c() {
        div = element("div");
        div.textContent = "Agent is thinking...";
        attr(div, "class", "agent-chat-loading");
      },
      m(target, anchor) {
        insert(target, div, anchor);
      },
      p: noop,
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_if_block_113(ctx) {
    let html_tag;
    let html_anchor;
    return {
      c() {
        html_tag = new HtmlTag(false);
        html_anchor = empty();
        html_tag.a = html_anchor;
      },
      m(target, anchor) {
        html_tag.m(
          /*loadingHtml*/
          ctx[0],
          target,
          anchor
        );
        insert(target, html_anchor, anchor);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*loadingHtml*/
        1)
          html_tag.p(
            /*loadingHtml*/
            ctx2[0]
          );
      },
      d(detaching) {
        if (detaching) {
          detach(html_anchor);
          html_tag.d();
        }
      }
    };
  }
  function create_fragment47(ctx) {
    let div5;
    let div1;
    let div0;
    let button0;
    let t0;
    let button1;
    let t1;
    let h3;
    let t2;
    let t3;
    let div3;
    let t4;
    let div2;
    let t5;
    let each_blocks = [];
    let each_1_lookup = /* @__PURE__ */ new Map();
    let t6;
    let t7;
    let div4;
    let textarea;
    let t8;
    let button2;
    let t9;
    let mounted;
    let dispose;
    let if_block0 = (
      /*showSessions*/
      ctx[8] && create_if_block_74(ctx)
    );
    let if_block1 = (
      /*messages*/
      ctx[1].length === 0 && create_if_block_64(ctx)
    );
    let each_value = ensure_array_like(
      /*messages*/
      ctx[1]
    );
    const get_key = (ctx2) => (
      /*msg*/
      ctx2[37] === /*messages*/
      ctx2[1][
        /*messages*/
        ctx2[1].length - 1
      ] ? null : Math.random()
    );
    for (let i = 0; i < each_value.length; i += 1) {
      let child_ctx = get_each_context10(ctx, each_value, i);
      let key = get_key(child_ctx);
      each_1_lookup.set(key, each_blocks[i] = create_each_block10(key, child_ctx));
    }
    let if_block2 = (
      /*loading*/
      ctx[5] && create_if_block17(ctx)
    );
    return {
      c() {
        div5 = element("div");
        div1 = element("div");
        div0 = element("div");
        button0 = element("button");
        button0.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>`;
        t0 = space();
        button1 = element("button");
        button1.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        t1 = space();
        h3 = element("h3");
        t2 = text(
          /*sessionTitle*/
          ctx[6]
        );
        t3 = space();
        div3 = element("div");
        if (if_block0)
          if_block0.c();
        t4 = space();
        div2 = element("div");
        if (if_block1)
          if_block1.c();
        t5 = space();
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        t6 = space();
        if (if_block2)
          if_block2.c();
        t7 = space();
        div4 = element("div");
        textarea = element("textarea");
        t8 = space();
        button2 = element("button");
        t9 = text("Send");
        attr(button0, "class", "agent-chat-sessions-btn");
        attr(button0, "title", "Sessions");
        attr(button1, "class", "agent-chat-new-btn");
        attr(button1, "title", "New Chat");
        attr(div0, "class", "agent-chat-header-left");
        attr(div1, "class", "agent-chat-header");
        attr(div2, "class", "agent-chat-messages");
        attr(div2, "role", "log");
        attr(div2, "tabindex", "0");
        attr(div3, "class", "agent-chat-body");
        attr(textarea, "class", "agent-chat-input");
        attr(textarea, "rows", "3");
        attr(textarea, "placeholder", PLACEHOLDER);
        attr(button2, "class", "agent-chat-send-button");
        button2.disabled = /*loading*/
        ctx[5];
        attr(div4, "class", "agent-chat-input-area");
        attr(div5, "class", "agent-chat-container");
      },
      m(target, anchor) {
        insert(target, div5, anchor);
        append(div5, div1);
        append(div1, div0);
        append(div0, button0);
        append(div0, t0);
        append(div0, button1);
        append(div0, t1);
        append(div0, h3);
        append(h3, t2);
        append(div5, t3);
        append(div5, div3);
        if (if_block0)
          if_block0.m(div3, null);
        append(div3, t4);
        append(div3, div2);
        if (if_block1)
          if_block1.m(div2, null);
        append(div2, t5);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(div2, null);
          }
        }
        append(div2, t6);
        if (if_block2)
          if_block2.m(div2, null);
        ctx[24](div2);
        append(div5, t7);
        append(div5, div4);
        append(div4, textarea);
        set_input_value(
          textarea,
          /*input*/
          ctx[4]
        );
        append(div4, t8);
        append(div4, button2);
        append(button2, t9);
        if (!mounted) {
          dispose = [
            listen(
              button0,
              "click",
              /*toggleSessions*/
              ctx[12]
            ),
            listen(
              button1,
              "click",
              /*newChat*/
              ctx[11]
            ),
            listen(
              div2,
              "click",
              /*handleLinkClick*/
              ctx[13]
            ),
            listen(div2, "keydown", keydown_handler_1),
            listen(
              textarea,
              "input",
              /*textarea_input_handler*/
              ctx[25]
            ),
            listen(
              textarea,
              "keydown",
              /*onKeydown*/
              ctx[15]
            ),
            listen(
              button2,
              "click",
              /*sendMessage*/
              ctx[14]
            )
          ];
          mounted = true;
        }
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*sessionTitle*/
        64)
          set_data(
            t2,
            /*sessionTitle*/
            ctx2[6]
          );
        if (
          /*showSessions*/
          ctx2[8]
        ) {
          if (if_block0) {
            if_block0.p(ctx2, dirty);
          } else {
            if_block0 = create_if_block_74(ctx2);
            if_block0.c();
            if_block0.m(div3, t4);
          }
        } else if (if_block0) {
          if_block0.d(1);
          if_block0 = null;
        }
        if (
          /*messages*/
          ctx2[1].length === 0
        ) {
          if (if_block1) {
            if_block1.p(ctx2, dirty);
          } else {
            if_block1 = create_if_block_64(ctx2);
            if_block1.c();
            if_block1.m(div2, t5);
          }
        } else if (if_block1) {
          if_block1.d(1);
          if_block1 = null;
        }
        if (dirty[0] & /*messages, showGraph*/
        65538) {
          each_value = ensure_array_like(
            /*messages*/
            ctx2[1]
          );
          each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx2, each_value, each_1_lookup, div2, destroy_block, create_each_block10, t6, get_each_context10);
        }
        if (
          /*loading*/
          ctx2[5]
        ) {
          if (if_block2) {
            if_block2.p(ctx2, dirty);
          } else {
            if_block2 = create_if_block17(ctx2);
            if_block2.c();
            if_block2.m(div2, null);
          }
        } else if (if_block2) {
          if_block2.d(1);
          if_block2 = null;
        }
        if (dirty[0] & /*input*/
        16) {
          set_input_value(
            textarea,
            /*input*/
            ctx2[4]
          );
        }
        if (dirty[0] & /*loading*/
        32) {
          button2.disabled = /*loading*/
          ctx2[5];
        }
      },
      i: noop,
      o: noop,
      d(detaching) {
        if (detaching) {
          detach(div5);
        }
        if (if_block0)
          if_block0.d();
        if (if_block1)
          if_block1.d();
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].d();
        }
        if (if_block2)
          if_block2.d();
        ctx[24](null);
        mounted = false;
        run_all(dispose);
      }
    };
  }
  var API = "/api/ext/agent";
  var PLACEHOLDER = "Ask a question about materials, experiments, properties...";
  function formatDate(iso) {
    if (!iso)
      return "";
    const d = new Date(iso);
    const now3 = /* @__PURE__ */ new Date();
    const diff = now3 - d;
    if (diff < 36e5)
      return `${Math.floor(diff / 6e4)}m ago`;
    if (diff < 864e5)
      return `${Math.floor(diff / 36e5)}h ago`;
    return d.toLocaleDateString();
  }
  var keydown_handler_1 = () => {
  };
  function instance47($$self, $$props, $$invalidate) {
    let { linkHandler = null } = $$props;
    let { graphHandler = null } = $$props;
    let { loadingHtml = null } = $$props;
    let messages = [];
    let input = "";
    let loading = false;
    let messagesEl;
    let currentSessionId = null;
    let sessionTitle = "New Chat";
    let sessions = [];
    let showSessions = false;
    let sessionLoaded = false;
    let saveTimer = null;
    async function initSessions() {
      try {
        const res = await fetch(`${API}/sessions`);
        if (!res.ok)
          return;
        $$invalidate(7, sessions = await res.json());
        if (sessions.length > 0) {
          await loadSession(sessions[0].id);
        } else {
          await createSession();
        }
      } catch {
        await createSession();
      }
    }
    async function createSession() {
      try {
        const res = await fetch(`${API}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New Chat" })
        });
        if (!res.ok)
          return;
        const s = await res.json();
        $$invalidate(3, currentSessionId = s.id);
        $$invalidate(6, sessionTitle = s.title);
        $$invalidate(1, messages = []);
        $$invalidate(19, sessionLoaded = true);
      } catch {
      }
    }
    async function loadSession(id2) {
      try {
        const res = await fetch(`${API}/sessions/${id2}`);
        if (!res.ok)
          return;
        const s = await res.json();
        $$invalidate(3, currentSessionId = s.id);
        $$invalidate(6, sessionTitle = s.title || "Untitled");
        $$invalidate(1, messages = s.messages || []);
        $$invalidate(19, sessionLoaded = true);
        $$invalidate(8, showSessions = false);
      } catch {
      }
    }
    function scheduleSave() {
      if (saveTimer)
        clearTimeout(saveTimer);
      saveTimer = setTimeout(saveSession, 500);
    }
    async function saveSession() {
      if (!currentSessionId)
        return;
      try {
        await fetch(`${API}/sessions/${currentSessionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, title: sessionTitle })
        });
      } catch {
      }
    }
    async function deleteSession(id2, e) {
      e.stopPropagation();
      try {
        await fetch(`${API}/sessions/${id2}`, { method: "DELETE" });
        $$invalidate(7, sessions = sessions.filter((s) => s.id !== id2));
        if (id2 === currentSessionId) {
          if (sessions.length > 0) {
            await loadSession(sessions[0].id);
          } else {
            await createSession();
          }
        }
      } catch {
      }
    }
    async function newChat() {
      await createSession();
      await fetchSessions();
      $$invalidate(8, showSessions = false);
    }
    async function fetchSessions() {
      try {
        const res = await fetch(`${API}/sessions`);
        if (res.ok)
          $$invalidate(7, sessions = await res.json());
      } catch {
      }
    }
    function toggleSessions() {
      $$invalidate(8, showSessions = !showSessions);
      if (showSessions)
        fetchSessions();
    }
    function openLink(path, quote) {
      var _a, _b, _c, _d;
      if (linkHandler) {
        linkHandler(path, quote || null);
      } else if ((_d = (_c = (_b = (_a = window.__ignis) == null ? void 0 : _a.obsidian) == null ? void 0 : _b.app) == null ? void 0 : _c.workspace) == null ? void 0 : _d.openLinkText) {
        window.__ignis.obsidian.app.workspace.openLinkText(path, quote || "", false);
      }
    }
    function handleLinkClick(e) {
      const target = e.target;
      if (target.classList.contains("agent-link")) {
        const path = target.getAttribute("data-path");
        if (path) {
          e.preventDefault();
          openLink(path, target.getAttribute("data-quote"));
        }
      }
    }
    function buildHistory(maxPairs = 5) {
      const pairs = [];
      for (let i = messages.length - 1; i >= 0 && pairs.length < maxPairs; i--) {
        if (messages[i].role === "agent") {
          const userMsg = i > 0 && messages[i - 1].role === "user" ? messages[i - 1] : null;
          if (userMsg) {
            pairs.unshift({
              user: userMsg.content,
              agent: messages[i].content
            });
            i--;
          }
        }
      }
      if (pairs.length === 0)
        return "";
      let ctx = "";
      for (const p of pairs) {
        ctx += `Q: ${p.user}
A: ${p.agent}

`;
      }
      return ctx.trimEnd();
    }
    async function sendMessage() {
      const query = input.trim();
      if (!query || loading)
        return;
      console.log("[agent] sendMessage:", query);
      stopCharAnim();
      if (messages.length === 0 && sessionTitle === "New Chat") {
        $$invalidate(6, sessionTitle = query.slice(0, 40) + (query.length > 40 ? "..." : ""));
      }
      $$invalidate(1, messages = [...messages, { role: "user", content: query }]);
      $$invalidate(4, input = "");
      $$invalidate(5, loading = true);
      const history2 = buildHistory();
      const enhancedQuery = history2 ? `${history2}
Current: ${query}` : query;
      try {
        const res = await fetch(`${API}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: enhancedQuery })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Server error (${res.status})`);
        }
        const contentType = res.headers.get("content-type") || "";
        console.log("[agent] response:", res.status, contentType);
        if (contentType.includes("text/event-stream")) {
          await handleSSE(res);
        } else {
          const data = await res.json();
          const html = renderResponse(data);
          $$invalidate(1, messages = [
            ...messages,
            {
              role: "agent",
              content: data.answer,
              html
            }
          ]);
        }
      } catch (err) {
        console.error("[agent] error:", err.message || err);
        $$invalidate(1, messages = [
          ...messages,
          {
            role: "error",
            content: err.message || "Unknown error"
          }
        ]);
      } finally {
        $$invalidate(5, loading = false);
      }
    }
    let charTimer = null;
    function stopCharAnim() {
      if (charTimer) {
        clearTimeout(charTimer);
        charTimer = null;
      }
    }
    async function handleSSE(res) {
      var _a, _b;
      console.log("[agent] handleSSE started");
      stopCharAnim();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let eventType = "";
      let fullAnswer = "";
      let pendingChars = "";
      let citations = [];
      let subgraph = { nodes: [], edges: [] };
      let backendSources = [];
      let hasError = false;
      let streaming = true;
      $$invalidate(1, messages = [...messages, { role: "agent", content: "", html: "" }]);
      const agentIdx = messages.length - 1;
      const before = messages.slice(0, agentIdx);
      function tickDelay(n) {
        if (n <= 0)
          return 60;
        if (n <= 3)
          return 45;
        if (n <= 8)
          return 30;
        if (n <= 20)
          return 18;
        if (n <= 60)
          return 12;
        return 8;
      }
      function tick2() {
        if (pendingChars.length > 0) {
          fullAnswer += pendingChars[0];
          pendingChars = pendingChars.slice(1);
          const html = `<div class="agent-block agent-block--answer">${parseMarkdown(fullAnswer)}<span class="agent-cursor">|</span></div>`;
          $$invalidate(1, messages = [...before, { role: "agent", content: fullAnswer, html }]);
          charTimer = setTimeout(tick2, tickDelay(pendingChars.length));
        } else if (streaming) {
          charTimer = setTimeout(tick2, tickDelay(0));
        } else {
          charTimer = null;
        }
      }
      tick2();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          streaming = false;
          break;
        }
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const payload = JSON.parse(line.slice(6));
              switch (eventType) {
                case "plan":
                  console.log("[agent] plan event:", payload == null ? void 0 : payload.intent);
                  break;
                case "token": {
                  const text2 = typeof payload === "string" ? payload : String(payload);
                  pendingChars += text2;
                  break;
                }
                case "citations":
                  citations = Array.isArray(payload) ? payload : [];
                  break;
                case "subgraph":
                  subgraph = payload && payload.nodes ? payload : { nodes: [], edges: [] };
                  console.log("[agent] subgraph event:", (_a = subgraph.nodes) == null ? void 0 : _a.length, "nodes", (_b = subgraph.edges) == null ? void 0 : _b.length, "edges");
                  break;
                case "sources":
                  backendSources = Array.isArray(payload) ? payload : [];
                  console.log("[agent] sources event:", backendSources.length, "sources");
                  break;
                case "done":
                  console.log("[agent] done event:", payload);
                  break;
                case "error":
                  hasError = true;
                  streaming = false;
                  const errText = typeof payload === "string" ? payload : (payload == null ? void 0 : payload.message) || "Backend error";
                  $$invalidate(1, messages = [...before, { role: "error", content: errText }]);
                  break;
              }
            } catch {
            }
          }
        }
      }
      while (charTimer || pendingChars.length > 0) {
        await new Promise((r) => setTimeout(r, 30));
      }
      if (!hasError) {
        const html = renderFromBackend(fullAnswer, subgraph, citations, backendSources);
        const showGraph2 = subgraph.nodes && subgraph.nodes.length > 0;
        console.log("[agent] final render: nodes=" + subgraph.nodes.length, "edges=" + subgraph.edges.length, "showGraph=" + showGraph2);
        $$invalidate(1, messages = [
          ...before,
          {
            role: "agent",
            content: fullAnswer,
            html,
            subgraph: showGraph2 ? subgraph : null
          }
        ]);
      }
    }
    function onKeydown(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    }
    function showGraph(subgraph) {
      if (graphHandler)
        graphHandler(subgraph);
    }
    initSessions();
    console.log("[agent] ChatView mounted");
    const click_handler = (s, e) => deleteSession(s.id, e);
    const click_handler_1 = (s) => loadSession(s.id);
    const keydown_handler = (s, e) => {
      if (e.key === "Enter")
        loadSession(s.id);
    };
    const click_handler_2 = (msg) => showGraph(msg.subgraph);
    function div2_binding($$value) {
      binding_callbacks[$$value ? "unshift" : "push"](() => {
        messagesEl = $$value;
        $$invalidate(2, messagesEl), $$invalidate(1, messages);
      });
    }
    function textarea_input_handler() {
      input = this.value;
      $$invalidate(4, input);
    }
    $$self.$$set = ($$props2) => {
      if ("linkHandler" in $$props2)
        $$invalidate(17, linkHandler = $$props2.linkHandler);
      if ("graphHandler" in $$props2)
        $$invalidate(18, graphHandler = $$props2.graphHandler);
      if ("loadingHtml" in $$props2)
        $$invalidate(0, loadingHtml = $$props2.loadingHtml);
    };
    $$self.$$.update = () => {
      if ($$self.$$.dirty[0] & /*messagesEl, messages*/
      6) {
        $:
          if (messagesEl && messages.length > 0) {
            $$invalidate(2, messagesEl.scrollTop = messagesEl.scrollHeight, messagesEl);
          }
      }
      if ($$self.$$.dirty[0] & /*sessionLoaded, currentSessionId, messages*/
      524298) {
        $:
          if (sessionLoaded && currentSessionId && messages) {
            scheduleSave();
          }
      }
    };
    return [
      loadingHtml,
      messages,
      messagesEl,
      currentSessionId,
      input,
      loading,
      sessionTitle,
      sessions,
      showSessions,
      loadSession,
      deleteSession,
      newChat,
      toggleSessions,
      handleLinkClick,
      sendMessage,
      onKeydown,
      showGraph,
      linkHandler,
      graphHandler,
      sessionLoaded,
      click_handler,
      click_handler_1,
      keydown_handler,
      click_handler_2,
      div2_binding,
      textarea_input_handler
    ];
  }
  var ChatView = class extends SvelteComponent {
    constructor(options) {
      super();
      init(
        this,
        options,
        instance47,
        create_fragment47,
        safe_not_equal,
        {
          linkHandler: 17,
          graphHandler: 18,
          loadingHtml: 0
        },
        add_css21,
        [-1, -1]
      );
    }
  };
  var ChatView_default = ChatView;

  // node_modules/d3-dispatch/src/dispatch.js
  var noop2 = { value: () => {
  } };
  function dispatch() {
    for (var i = 0, n = arguments.length, _ = {}, t; i < n; ++i) {
      if (!(t = arguments[i] + "") || t in _ || /[\s.]/.test(t))
        throw new Error("illegal type: " + t);
      _[t] = [];
    }
    return new Dispatch(_);
  }
  function Dispatch(_) {
    this._ = _;
  }
  function parseTypenames(typenames, types) {
    return typenames.trim().split(/^|\s+/).map(function(t) {
      var name = "", i = t.indexOf(".");
      if (i >= 0)
        name = t.slice(i + 1), t = t.slice(0, i);
      if (t && !types.hasOwnProperty(t))
        throw new Error("unknown type: " + t);
      return { type: t, name };
    });
  }
  Dispatch.prototype = dispatch.prototype = {
    constructor: Dispatch,
    on: function(typename, callback) {
      var _ = this._, T = parseTypenames(typename + "", _), t, i = -1, n = T.length;
      if (arguments.length < 2) {
        while (++i < n)
          if ((t = (typename = T[i]).type) && (t = get(_[t], typename.name)))
            return t;
        return;
      }
      if (callback != null && typeof callback !== "function")
        throw new Error("invalid callback: " + callback);
      while (++i < n) {
        if (t = (typename = T[i]).type)
          _[t] = set(_[t], typename.name, callback);
        else if (callback == null)
          for (t in _)
            _[t] = set(_[t], typename.name, null);
      }
      return this;
    },
    copy: function() {
      var copy = {}, _ = this._;
      for (var t in _)
        copy[t] = _[t].slice();
      return new Dispatch(copy);
    },
    call: function(type2, that) {
      if ((n = arguments.length - 2) > 0)
        for (var args = new Array(n), i = 0, n, t; i < n; ++i)
          args[i] = arguments[i + 2];
      if (!this._.hasOwnProperty(type2))
        throw new Error("unknown type: " + type2);
      for (t = this._[type2], i = 0, n = t.length; i < n; ++i)
        t[i].value.apply(that, args);
    },
    apply: function(type2, that, args) {
      if (!this._.hasOwnProperty(type2))
        throw new Error("unknown type: " + type2);
      for (var t = this._[type2], i = 0, n = t.length; i < n; ++i)
        t[i].value.apply(that, args);
    }
  };
  function get(type2, name) {
    for (var i = 0, n = type2.length, c2; i < n; ++i) {
      if ((c2 = type2[i]).name === name) {
        return c2.value;
      }
    }
  }
  function set(type2, name, callback) {
    for (var i = 0, n = type2.length; i < n; ++i) {
      if (type2[i].name === name) {
        type2[i] = noop2, type2 = type2.slice(0, i).concat(type2.slice(i + 1));
        break;
      }
    }
    if (callback != null)
      type2.push({ name, value: callback });
    return type2;
  }
  var dispatch_default = dispatch;

  // node_modules/d3-selection/src/namespaces.js
  var xhtml = "http://www.w3.org/1999/xhtml";
  var namespaces_default = {
    svg: "http://www.w3.org/2000/svg",
    xhtml,
    xlink: "http://www.w3.org/1999/xlink",
    xml: "http://www.w3.org/XML/1998/namespace",
    xmlns: "http://www.w3.org/2000/xmlns/"
  };

  // node_modules/d3-selection/src/namespace.js
  function namespace_default(name) {
    var prefix = name += "", i = prefix.indexOf(":");
    if (i >= 0 && (prefix = name.slice(0, i)) !== "xmlns")
      name = name.slice(i + 1);
    return namespaces_default.hasOwnProperty(prefix) ? { space: namespaces_default[prefix], local: name } : name;
  }

  // node_modules/d3-selection/src/creator.js
  function creatorInherit(name) {
    return function() {
      var document2 = this.ownerDocument, uri = this.namespaceURI;
      return uri === xhtml && document2.documentElement.namespaceURI === xhtml ? document2.createElement(name) : document2.createElementNS(uri, name);
    };
  }
  function creatorFixed(fullname) {
    return function() {
      return this.ownerDocument.createElementNS(fullname.space, fullname.local);
    };
  }
  function creator_default(name) {
    var fullname = namespace_default(name);
    return (fullname.local ? creatorFixed : creatorInherit)(fullname);
  }

  // node_modules/d3-selection/src/selector.js
  function none() {
  }
  function selector_default(selector) {
    return selector == null ? none : function() {
      return this.querySelector(selector);
    };
  }

  // node_modules/d3-selection/src/selection/select.js
  function select_default(select) {
    if (typeof select !== "function")
      select = selector_default(select);
    for (var groups = this._groups, m2 = groups.length, subgroups = new Array(m2), j = 0; j < m2; ++j) {
      for (var group = groups[j], n = group.length, subgroup = subgroups[j] = new Array(n), node, subnode, i = 0; i < n; ++i) {
        if ((node = group[i]) && (subnode = select.call(node, node.__data__, i, group))) {
          if ("__data__" in node)
            subnode.__data__ = node.__data__;
          subgroup[i] = subnode;
        }
      }
    }
    return new Selection(subgroups, this._parents);
  }

  // node_modules/d3-selection/src/array.js
  function array(x3) {
    return x3 == null ? [] : Array.isArray(x3) ? x3 : Array.from(x3);
  }

  // node_modules/d3-selection/src/selectorAll.js
  function empty2() {
    return [];
  }
  function selectorAll_default(selector) {
    return selector == null ? empty2 : function() {
      return this.querySelectorAll(selector);
    };
  }

  // node_modules/d3-selection/src/selection/selectAll.js
  function arrayAll(select) {
    return function() {
      return array(select.apply(this, arguments));
    };
  }
  function selectAll_default(select) {
    if (typeof select === "function")
      select = arrayAll(select);
    else
      select = selectorAll_default(select);
    for (var groups = this._groups, m2 = groups.length, subgroups = [], parents = [], j = 0; j < m2; ++j) {
      for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
        if (node = group[i]) {
          subgroups.push(select.call(node, node.__data__, i, group));
          parents.push(node);
        }
      }
    }
    return new Selection(subgroups, parents);
  }

  // node_modules/d3-selection/src/matcher.js
  function matcher_default(selector) {
    return function() {
      return this.matches(selector);
    };
  }
  function childMatcher(selector) {
    return function(node) {
      return node.matches(selector);
    };
  }

  // node_modules/d3-selection/src/selection/selectChild.js
  var find = Array.prototype.find;
  function childFind(match) {
    return function() {
      return find.call(this.children, match);
    };
  }
  function childFirst() {
    return this.firstElementChild;
  }
  function selectChild_default(match) {
    return this.select(match == null ? childFirst : childFind(typeof match === "function" ? match : childMatcher(match)));
  }

  // node_modules/d3-selection/src/selection/selectChildren.js
  var filter = Array.prototype.filter;
  function children2() {
    return Array.from(this.children);
  }
  function childrenFilter(match) {
    return function() {
      return filter.call(this.children, match);
    };
  }
  function selectChildren_default(match) {
    return this.selectAll(match == null ? children2 : childrenFilter(typeof match === "function" ? match : childMatcher(match)));
  }

  // node_modules/d3-selection/src/selection/filter.js
  function filter_default(match) {
    if (typeof match !== "function")
      match = matcher_default(match);
    for (var groups = this._groups, m2 = groups.length, subgroups = new Array(m2), j = 0; j < m2; ++j) {
      for (var group = groups[j], n = group.length, subgroup = subgroups[j] = [], node, i = 0; i < n; ++i) {
        if ((node = group[i]) && match.call(node, node.__data__, i, group)) {
          subgroup.push(node);
        }
      }
    }
    return new Selection(subgroups, this._parents);
  }

  // node_modules/d3-selection/src/selection/sparse.js
  function sparse_default(update2) {
    return new Array(update2.length);
  }

  // node_modules/d3-selection/src/selection/enter.js
  function enter_default() {
    return new Selection(this._enter || this._groups.map(sparse_default), this._parents);
  }
  function EnterNode(parent, datum2) {
    this.ownerDocument = parent.ownerDocument;
    this.namespaceURI = parent.namespaceURI;
    this._next = null;
    this._parent = parent;
    this.__data__ = datum2;
  }
  EnterNode.prototype = {
    constructor: EnterNode,
    appendChild: function(child) {
      return this._parent.insertBefore(child, this._next);
    },
    insertBefore: function(child, next) {
      return this._parent.insertBefore(child, next);
    },
    querySelector: function(selector) {
      return this._parent.querySelector(selector);
    },
    querySelectorAll: function(selector) {
      return this._parent.querySelectorAll(selector);
    }
  };

  // node_modules/d3-selection/src/constant.js
  function constant_default(x3) {
    return function() {
      return x3;
    };
  }

  // node_modules/d3-selection/src/selection/data.js
  function bindIndex(parent, group, enter, update2, exit, data) {
    var i = 0, node, groupLength = group.length, dataLength = data.length;
    for (; i < dataLength; ++i) {
      if (node = group[i]) {
        node.__data__ = data[i];
        update2[i] = node;
      } else {
        enter[i] = new EnterNode(parent, data[i]);
      }
    }
    for (; i < groupLength; ++i) {
      if (node = group[i]) {
        exit[i] = node;
      }
    }
  }
  function bindKey(parent, group, enter, update2, exit, data, key) {
    var i, node, nodeByKeyValue = /* @__PURE__ */ new Map(), groupLength = group.length, dataLength = data.length, keyValues = new Array(groupLength), keyValue;
    for (i = 0; i < groupLength; ++i) {
      if (node = group[i]) {
        keyValues[i] = keyValue = key.call(node, node.__data__, i, group) + "";
        if (nodeByKeyValue.has(keyValue)) {
          exit[i] = node;
        } else {
          nodeByKeyValue.set(keyValue, node);
        }
      }
    }
    for (i = 0; i < dataLength; ++i) {
      keyValue = key.call(parent, data[i], i, data) + "";
      if (node = nodeByKeyValue.get(keyValue)) {
        update2[i] = node;
        node.__data__ = data[i];
        nodeByKeyValue.delete(keyValue);
      } else {
        enter[i] = new EnterNode(parent, data[i]);
      }
    }
    for (i = 0; i < groupLength; ++i) {
      if ((node = group[i]) && nodeByKeyValue.get(keyValues[i]) === node) {
        exit[i] = node;
      }
    }
  }
  function datum(node) {
    return node.__data__;
  }
  function data_default(value, key) {
    if (!arguments.length)
      return Array.from(this, datum);
    var bind2 = key ? bindKey : bindIndex, parents = this._parents, groups = this._groups;
    if (typeof value !== "function")
      value = constant_default(value);
    for (var m2 = groups.length, update2 = new Array(m2), enter = new Array(m2), exit = new Array(m2), j = 0; j < m2; ++j) {
      var parent = parents[j], group = groups[j], groupLength = group.length, data = arraylike(value.call(parent, parent && parent.__data__, j, parents)), dataLength = data.length, enterGroup = enter[j] = new Array(dataLength), updateGroup = update2[j] = new Array(dataLength), exitGroup = exit[j] = new Array(groupLength);
      bind2(parent, group, enterGroup, updateGroup, exitGroup, data, key);
      for (var i0 = 0, i1 = 0, previous, next; i0 < dataLength; ++i0) {
        if (previous = enterGroup[i0]) {
          if (i0 >= i1)
            i1 = i0 + 1;
          while (!(next = updateGroup[i1]) && ++i1 < dataLength)
            ;
          previous._next = next || null;
        }
      }
    }
    update2 = new Selection(update2, parents);
    update2._enter = enter;
    update2._exit = exit;
    return update2;
  }
  function arraylike(data) {
    return typeof data === "object" && "length" in data ? data : Array.from(data);
  }

  // node_modules/d3-selection/src/selection/exit.js
  function exit_default() {
    return new Selection(this._exit || this._groups.map(sparse_default), this._parents);
  }

  // node_modules/d3-selection/src/selection/join.js
  function join_default(onenter, onupdate, onexit) {
    var enter = this.enter(), update2 = this, exit = this.exit();
    if (typeof onenter === "function") {
      enter = onenter(enter);
      if (enter)
        enter = enter.selection();
    } else {
      enter = enter.append(onenter + "");
    }
    if (onupdate != null) {
      update2 = onupdate(update2);
      if (update2)
        update2 = update2.selection();
    }
    if (onexit == null)
      exit.remove();
    else
      onexit(exit);
    return enter && update2 ? enter.merge(update2).order() : update2;
  }

  // node_modules/d3-selection/src/selection/merge.js
  function merge_default(context) {
    var selection2 = context.selection ? context.selection() : context;
    for (var groups0 = this._groups, groups1 = selection2._groups, m0 = groups0.length, m1 = groups1.length, m2 = Math.min(m0, m1), merges = new Array(m0), j = 0; j < m2; ++j) {
      for (var group0 = groups0[j], group1 = groups1[j], n = group0.length, merge = merges[j] = new Array(n), node, i = 0; i < n; ++i) {
        if (node = group0[i] || group1[i]) {
          merge[i] = node;
        }
      }
    }
    for (; j < m0; ++j) {
      merges[j] = groups0[j];
    }
    return new Selection(merges, this._parents);
  }

  // node_modules/d3-selection/src/selection/order.js
  function order_default() {
    for (var groups = this._groups, j = -1, m2 = groups.length; ++j < m2; ) {
      for (var group = groups[j], i = group.length - 1, next = group[i], node; --i >= 0; ) {
        if (node = group[i]) {
          if (next && node.compareDocumentPosition(next) ^ 4)
            next.parentNode.insertBefore(node, next);
          next = node;
        }
      }
    }
    return this;
  }

  // node_modules/d3-selection/src/selection/sort.js
  function sort_default(compare) {
    if (!compare)
      compare = ascending;
    function compareNode(a2, b) {
      return a2 && b ? compare(a2.__data__, b.__data__) : !a2 - !b;
    }
    for (var groups = this._groups, m2 = groups.length, sortgroups = new Array(m2), j = 0; j < m2; ++j) {
      for (var group = groups[j], n = group.length, sortgroup = sortgroups[j] = new Array(n), node, i = 0; i < n; ++i) {
        if (node = group[i]) {
          sortgroup[i] = node;
        }
      }
      sortgroup.sort(compareNode);
    }
    return new Selection(sortgroups, this._parents).order();
  }
  function ascending(a2, b) {
    return a2 < b ? -1 : a2 > b ? 1 : a2 >= b ? 0 : NaN;
  }

  // node_modules/d3-selection/src/selection/call.js
  function call_default() {
    var callback = arguments[0];
    arguments[0] = this;
    callback.apply(null, arguments);
    return this;
  }

  // node_modules/d3-selection/src/selection/nodes.js
  function nodes_default() {
    return Array.from(this);
  }

  // node_modules/d3-selection/src/selection/node.js
  function node_default() {
    for (var groups = this._groups, j = 0, m2 = groups.length; j < m2; ++j) {
      for (var group = groups[j], i = 0, n = group.length; i < n; ++i) {
        var node = group[i];
        if (node)
          return node;
      }
    }
    return null;
  }

  // node_modules/d3-selection/src/selection/size.js
  function size_default() {
    let size = 0;
    for (const node of this)
      ++size;
    return size;
  }

  // node_modules/d3-selection/src/selection/empty.js
  function empty_default() {
    return !this.node();
  }

  // node_modules/d3-selection/src/selection/each.js
  function each_default(callback) {
    for (var groups = this._groups, j = 0, m2 = groups.length; j < m2; ++j) {
      for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i) {
        if (node = group[i])
          callback.call(node, node.__data__, i, group);
      }
    }
    return this;
  }

  // node_modules/d3-selection/src/selection/attr.js
  function attrRemove(name) {
    return function() {
      this.removeAttribute(name);
    };
  }
  function attrRemoveNS(fullname) {
    return function() {
      this.removeAttributeNS(fullname.space, fullname.local);
    };
  }
  function attrConstant(name, value) {
    return function() {
      this.setAttribute(name, value);
    };
  }
  function attrConstantNS(fullname, value) {
    return function() {
      this.setAttributeNS(fullname.space, fullname.local, value);
    };
  }
  function attrFunction(name, value) {
    return function() {
      var v = value.apply(this, arguments);
      if (v == null)
        this.removeAttribute(name);
      else
        this.setAttribute(name, v);
    };
  }
  function attrFunctionNS(fullname, value) {
    return function() {
      var v = value.apply(this, arguments);
      if (v == null)
        this.removeAttributeNS(fullname.space, fullname.local);
      else
        this.setAttributeNS(fullname.space, fullname.local, v);
    };
  }
  function attr_default(name, value) {
    var fullname = namespace_default(name);
    if (arguments.length < 2) {
      var node = this.node();
      return fullname.local ? node.getAttributeNS(fullname.space, fullname.local) : node.getAttribute(fullname);
    }
    return this.each((value == null ? fullname.local ? attrRemoveNS : attrRemove : typeof value === "function" ? fullname.local ? attrFunctionNS : attrFunction : fullname.local ? attrConstantNS : attrConstant)(fullname, value));
  }

  // node_modules/d3-selection/src/window.js
  function window_default(node) {
    return node.ownerDocument && node.ownerDocument.defaultView || node.document && node || node.defaultView;
  }

  // node_modules/d3-selection/src/selection/style.js
  function styleRemove(name) {
    return function() {
      this.style.removeProperty(name);
    };
  }
  function styleConstant(name, value, priority) {
    return function() {
      this.style.setProperty(name, value, priority);
    };
  }
  function styleFunction(name, value, priority) {
    return function() {
      var v = value.apply(this, arguments);
      if (v == null)
        this.style.removeProperty(name);
      else
        this.style.setProperty(name, v, priority);
    };
  }
  function style_default(name, value, priority) {
    return arguments.length > 1 ? this.each((value == null ? styleRemove : typeof value === "function" ? styleFunction : styleConstant)(name, value, priority == null ? "" : priority)) : styleValue(this.node(), name);
  }
  function styleValue(node, name) {
    return node.style.getPropertyValue(name) || window_default(node).getComputedStyle(node, null).getPropertyValue(name);
  }

  // node_modules/d3-selection/src/selection/property.js
  function propertyRemove(name) {
    return function() {
      delete this[name];
    };
  }
  function propertyConstant(name, value) {
    return function() {
      this[name] = value;
    };
  }
  function propertyFunction(name, value) {
    return function() {
      var v = value.apply(this, arguments);
      if (v == null)
        delete this[name];
      else
        this[name] = v;
    };
  }
  function property_default(name, value) {
    return arguments.length > 1 ? this.each((value == null ? propertyRemove : typeof value === "function" ? propertyFunction : propertyConstant)(name, value)) : this.node()[name];
  }

  // node_modules/d3-selection/src/selection/classed.js
  function classArray(string) {
    return string.trim().split(/^|\s+/);
  }
  function classList(node) {
    return node.classList || new ClassList(node);
  }
  function ClassList(node) {
    this._node = node;
    this._names = classArray(node.getAttribute("class") || "");
  }
  ClassList.prototype = {
    add: function(name) {
      var i = this._names.indexOf(name);
      if (i < 0) {
        this._names.push(name);
        this._node.setAttribute("class", this._names.join(" "));
      }
    },
    remove: function(name) {
      var i = this._names.indexOf(name);
      if (i >= 0) {
        this._names.splice(i, 1);
        this._node.setAttribute("class", this._names.join(" "));
      }
    },
    contains: function(name) {
      return this._names.indexOf(name) >= 0;
    }
  };
  function classedAdd(node, names) {
    var list = classList(node), i = -1, n = names.length;
    while (++i < n)
      list.add(names[i]);
  }
  function classedRemove(node, names) {
    var list = classList(node), i = -1, n = names.length;
    while (++i < n)
      list.remove(names[i]);
  }
  function classedTrue(names) {
    return function() {
      classedAdd(this, names);
    };
  }
  function classedFalse(names) {
    return function() {
      classedRemove(this, names);
    };
  }
  function classedFunction(names, value) {
    return function() {
      (value.apply(this, arguments) ? classedAdd : classedRemove)(this, names);
    };
  }
  function classed_default(name, value) {
    var names = classArray(name + "");
    if (arguments.length < 2) {
      var list = classList(this.node()), i = -1, n = names.length;
      while (++i < n)
        if (!list.contains(names[i]))
          return false;
      return true;
    }
    return this.each((typeof value === "function" ? classedFunction : value ? classedTrue : classedFalse)(names, value));
  }

  // node_modules/d3-selection/src/selection/text.js
  function textRemove() {
    this.textContent = "";
  }
  function textConstant(value) {
    return function() {
      this.textContent = value;
    };
  }
  function textFunction(value) {
    return function() {
      var v = value.apply(this, arguments);
      this.textContent = v == null ? "" : v;
    };
  }
  function text_default(value) {
    return arguments.length ? this.each(value == null ? textRemove : (typeof value === "function" ? textFunction : textConstant)(value)) : this.node().textContent;
  }

  // node_modules/d3-selection/src/selection/html.js
  function htmlRemove() {
    this.innerHTML = "";
  }
  function htmlConstant(value) {
    return function() {
      this.innerHTML = value;
    };
  }
  function htmlFunction(value) {
    return function() {
      var v = value.apply(this, arguments);
      this.innerHTML = v == null ? "" : v;
    };
  }
  function html_default(value) {
    return arguments.length ? this.each(value == null ? htmlRemove : (typeof value === "function" ? htmlFunction : htmlConstant)(value)) : this.node().innerHTML;
  }

  // node_modules/d3-selection/src/selection/raise.js
  function raise() {
    if (this.nextSibling)
      this.parentNode.appendChild(this);
  }
  function raise_default() {
    return this.each(raise);
  }

  // node_modules/d3-selection/src/selection/lower.js
  function lower() {
    if (this.previousSibling)
      this.parentNode.insertBefore(this, this.parentNode.firstChild);
  }
  function lower_default() {
    return this.each(lower);
  }

  // node_modules/d3-selection/src/selection/append.js
  function append_default(name) {
    var create2 = typeof name === "function" ? name : creator_default(name);
    return this.select(function() {
      return this.appendChild(create2.apply(this, arguments));
    });
  }

  // node_modules/d3-selection/src/selection/insert.js
  function constantNull() {
    return null;
  }
  function insert_default(name, before) {
    var create2 = typeof name === "function" ? name : creator_default(name), select = before == null ? constantNull : typeof before === "function" ? before : selector_default(before);
    return this.select(function() {
      return this.insertBefore(create2.apply(this, arguments), select.apply(this, arguments) || null);
    });
  }

  // node_modules/d3-selection/src/selection/remove.js
  function remove() {
    var parent = this.parentNode;
    if (parent)
      parent.removeChild(this);
  }
  function remove_default() {
    return this.each(remove);
  }

  // node_modules/d3-selection/src/selection/clone.js
  function selection_cloneShallow() {
    var clone = this.cloneNode(false), parent = this.parentNode;
    return parent ? parent.insertBefore(clone, this.nextSibling) : clone;
  }
  function selection_cloneDeep() {
    var clone = this.cloneNode(true), parent = this.parentNode;
    return parent ? parent.insertBefore(clone, this.nextSibling) : clone;
  }
  function clone_default(deep) {
    return this.select(deep ? selection_cloneDeep : selection_cloneShallow);
  }

  // node_modules/d3-selection/src/selection/datum.js
  function datum_default(value) {
    return arguments.length ? this.property("__data__", value) : this.node().__data__;
  }

  // node_modules/d3-selection/src/selection/on.js
  function contextListener(listener) {
    return function(event) {
      listener.call(this, event, this.__data__);
    };
  }
  function parseTypenames2(typenames) {
    return typenames.trim().split(/^|\s+/).map(function(t) {
      var name = "", i = t.indexOf(".");
      if (i >= 0)
        name = t.slice(i + 1), t = t.slice(0, i);
      return { type: t, name };
    });
  }
  function onRemove(typename) {
    return function() {
      var on = this.__on;
      if (!on)
        return;
      for (var j = 0, i = -1, m2 = on.length, o; j < m2; ++j) {
        if (o = on[j], (!typename.type || o.type === typename.type) && o.name === typename.name) {
          this.removeEventListener(o.type, o.listener, o.options);
        } else {
          on[++i] = o;
        }
      }
      if (++i)
        on.length = i;
      else
        delete this.__on;
    };
  }
  function onAdd(typename, value, options) {
    return function() {
      var on = this.__on, o, listener = contextListener(value);
      if (on)
        for (var j = 0, m2 = on.length; j < m2; ++j) {
          if ((o = on[j]).type === typename.type && o.name === typename.name) {
            this.removeEventListener(o.type, o.listener, o.options);
            this.addEventListener(o.type, o.listener = listener, o.options = options);
            o.value = value;
            return;
          }
        }
      this.addEventListener(typename.type, listener, options);
      o = { type: typename.type, name: typename.name, value, listener, options };
      if (!on)
        this.__on = [o];
      else
        on.push(o);
    };
  }
  function on_default(typename, value, options) {
    var typenames = parseTypenames2(typename + ""), i, n = typenames.length, t;
    if (arguments.length < 2) {
      var on = this.node().__on;
      if (on)
        for (var j = 0, m2 = on.length, o; j < m2; ++j) {
          for (i = 0, o = on[j]; i < n; ++i) {
            if ((t = typenames[i]).type === o.type && t.name === o.name) {
              return o.value;
            }
          }
        }
      return;
    }
    on = value ? onAdd : onRemove;
    for (i = 0; i < n; ++i)
      this.each(on(typenames[i], value, options));
    return this;
  }

  // node_modules/d3-selection/src/selection/dispatch.js
  function dispatchEvent(node, type2, params) {
    var window2 = window_default(node), event = window2.CustomEvent;
    if (typeof event === "function") {
      event = new event(type2, params);
    } else {
      event = window2.document.createEvent("Event");
      if (params)
        event.initEvent(type2, params.bubbles, params.cancelable), event.detail = params.detail;
      else
        event.initEvent(type2, false, false);
    }
    node.dispatchEvent(event);
  }
  function dispatchConstant(type2, params) {
    return function() {
      return dispatchEvent(this, type2, params);
    };
  }
  function dispatchFunction(type2, params) {
    return function() {
      return dispatchEvent(this, type2, params.apply(this, arguments));
    };
  }
  function dispatch_default2(type2, params) {
    return this.each((typeof params === "function" ? dispatchFunction : dispatchConstant)(type2, params));
  }

  // node_modules/d3-selection/src/selection/iterator.js
  function* iterator_default() {
    for (var groups = this._groups, j = 0, m2 = groups.length; j < m2; ++j) {
      for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i) {
        if (node = group[i])
          yield node;
      }
    }
  }

  // node_modules/d3-selection/src/selection/index.js
  var root = [null];
  function Selection(groups, parents) {
    this._groups = groups;
    this._parents = parents;
  }
  function selection() {
    return new Selection([[document.documentElement]], root);
  }
  function selection_selection() {
    return this;
  }
  Selection.prototype = selection.prototype = {
    constructor: Selection,
    select: select_default,
    selectAll: selectAll_default,
    selectChild: selectChild_default,
    selectChildren: selectChildren_default,
    filter: filter_default,
    data: data_default,
    enter: enter_default,
    exit: exit_default,
    join: join_default,
    merge: merge_default,
    selection: selection_selection,
    order: order_default,
    sort: sort_default,
    call: call_default,
    nodes: nodes_default,
    node: node_default,
    size: size_default,
    empty: empty_default,
    each: each_default,
    attr: attr_default,
    style: style_default,
    property: property_default,
    classed: classed_default,
    text: text_default,
    html: html_default,
    raise: raise_default,
    lower: lower_default,
    append: append_default,
    insert: insert_default,
    remove: remove_default,
    clone: clone_default,
    datum: datum_default,
    on: on_default,
    dispatch: dispatch_default2,
    [Symbol.iterator]: iterator_default
  };
  var selection_default = selection;

  // node_modules/d3-selection/src/select.js
  function select_default2(selector) {
    return typeof selector === "string" ? new Selection([[document.querySelector(selector)]], [document.documentElement]) : new Selection([[selector]], root);
  }

  // node_modules/d3-selection/src/sourceEvent.js
  function sourceEvent_default(event) {
    let sourceEvent;
    while (sourceEvent = event.sourceEvent)
      event = sourceEvent;
    return event;
  }

  // node_modules/d3-selection/src/pointer.js
  function pointer_default(event, node) {
    event = sourceEvent_default(event);
    if (node === void 0)
      node = event.currentTarget;
    if (node) {
      var svg = node.ownerSVGElement || node;
      if (svg.createSVGPoint) {
        var point = svg.createSVGPoint();
        point.x = event.clientX, point.y = event.clientY;
        point = point.matrixTransform(node.getScreenCTM().inverse());
        return [point.x, point.y];
      }
      if (node.getBoundingClientRect) {
        var rect = node.getBoundingClientRect();
        return [event.clientX - rect.left - node.clientLeft, event.clientY - rect.top - node.clientTop];
      }
    }
    return [event.pageX, event.pageY];
  }

  // node_modules/d3-drag/src/noevent.js
  var nonpassive = { passive: false };
  var nonpassivecapture = { capture: true, passive: false };
  function nopropagation(event) {
    event.stopImmediatePropagation();
  }
  function noevent_default(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  // node_modules/d3-drag/src/nodrag.js
  function nodrag_default(view) {
    var root2 = view.document.documentElement, selection2 = select_default2(view).on("dragstart.drag", noevent_default, nonpassivecapture);
    if ("onselectstart" in root2) {
      selection2.on("selectstart.drag", noevent_default, nonpassivecapture);
    } else {
      root2.__noselect = root2.style.MozUserSelect;
      root2.style.MozUserSelect = "none";
    }
  }
  function yesdrag(view, noclick) {
    var root2 = view.document.documentElement, selection2 = select_default2(view).on("dragstart.drag", null);
    if (noclick) {
      selection2.on("click.drag", noevent_default, nonpassivecapture);
      setTimeout(function() {
        selection2.on("click.drag", null);
      }, 0);
    }
    if ("onselectstart" in root2) {
      selection2.on("selectstart.drag", null);
    } else {
      root2.style.MozUserSelect = root2.__noselect;
      delete root2.__noselect;
    }
  }

  // node_modules/d3-drag/src/constant.js
  var constant_default2 = (x3) => () => x3;

  // node_modules/d3-drag/src/event.js
  function DragEvent(type2, {
    sourceEvent,
    subject,
    target,
    identifier,
    active,
    x: x3,
    y: y3,
    dx,
    dy,
    dispatch: dispatch2
  }) {
    Object.defineProperties(this, {
      type: { value: type2, enumerable: true, configurable: true },
      sourceEvent: { value: sourceEvent, enumerable: true, configurable: true },
      subject: { value: subject, enumerable: true, configurable: true },
      target: { value: target, enumerable: true, configurable: true },
      identifier: { value: identifier, enumerable: true, configurable: true },
      active: { value: active, enumerable: true, configurable: true },
      x: { value: x3, enumerable: true, configurable: true },
      y: { value: y3, enumerable: true, configurable: true },
      dx: { value: dx, enumerable: true, configurable: true },
      dy: { value: dy, enumerable: true, configurable: true },
      _: { value: dispatch2 }
    });
  }
  DragEvent.prototype.on = function() {
    var value = this._.on.apply(this._, arguments);
    return value === this._ ? this : value;
  };

  // node_modules/d3-drag/src/drag.js
  function defaultFilter(event) {
    return !event.ctrlKey && !event.button;
  }
  function defaultContainer() {
    return this.parentNode;
  }
  function defaultSubject(event, d) {
    return d == null ? { x: event.x, y: event.y } : d;
  }
  function defaultTouchable() {
    return navigator.maxTouchPoints || "ontouchstart" in this;
  }
  function drag_default() {
    var filter2 = defaultFilter, container = defaultContainer, subject = defaultSubject, touchable = defaultTouchable, gestures = {}, listeners = dispatch_default("start", "drag", "end"), active = 0, mousedownx, mousedowny, mousemoving, touchending, clickDistance2 = 0;
    function drag(selection2) {
      selection2.on("mousedown.drag", mousedowned).filter(touchable).on("touchstart.drag", touchstarted).on("touchmove.drag", touchmoved, nonpassive).on("touchend.drag touchcancel.drag", touchended).style("touch-action", "none").style("-webkit-tap-highlight-color", "rgba(0,0,0,0)");
    }
    function mousedowned(event, d) {
      if (touchending || !filter2.call(this, event, d))
        return;
      var gesture = beforestart(this, container.call(this, event, d), event, d, "mouse");
      if (!gesture)
        return;
      select_default2(event.view).on("mousemove.drag", mousemoved, nonpassivecapture).on("mouseup.drag", mouseupped, nonpassivecapture);
      nodrag_default(event.view);
      nopropagation(event);
      mousemoving = false;
      mousedownx = event.clientX;
      mousedowny = event.clientY;
      gesture("start", event);
    }
    function mousemoved(event) {
      noevent_default(event);
      if (!mousemoving) {
        var dx = event.clientX - mousedownx, dy = event.clientY - mousedowny;
        mousemoving = dx * dx + dy * dy > clickDistance2;
      }
      gestures.mouse("drag", event);
    }
    function mouseupped(event) {
      select_default2(event.view).on("mousemove.drag mouseup.drag", null);
      yesdrag(event.view, mousemoving);
      noevent_default(event);
      gestures.mouse("end", event);
    }
    function touchstarted(event, d) {
      if (!filter2.call(this, event, d))
        return;
      var touches = event.changedTouches, c2 = container.call(this, event, d), n = touches.length, i, gesture;
      for (i = 0; i < n; ++i) {
        if (gesture = beforestart(this, c2, event, d, touches[i].identifier, touches[i])) {
          nopropagation(event);
          gesture("start", event, touches[i]);
        }
      }
    }
    function touchmoved(event) {
      var touches = event.changedTouches, n = touches.length, i, gesture;
      for (i = 0; i < n; ++i) {
        if (gesture = gestures[touches[i].identifier]) {
          noevent_default(event);
          gesture("drag", event, touches[i]);
        }
      }
    }
    function touchended(event) {
      var touches = event.changedTouches, n = touches.length, i, gesture;
      if (touchending)
        clearTimeout(touchending);
      touchending = setTimeout(function() {
        touchending = null;
      }, 500);
      for (i = 0; i < n; ++i) {
        if (gesture = gestures[touches[i].identifier]) {
          nopropagation(event);
          gesture("end", event, touches[i]);
        }
      }
    }
    function beforestart(that, container2, event, d, identifier, touch) {
      var dispatch2 = listeners.copy(), p = pointer_default(touch || event, container2), dx, dy, s;
      if ((s = subject.call(that, new DragEvent("beforestart", {
        sourceEvent: event,
        target: drag,
        identifier,
        active,
        x: p[0],
        y: p[1],
        dx: 0,
        dy: 0,
        dispatch: dispatch2
      }), d)) == null)
        return;
      dx = s.x - p[0] || 0;
      dy = s.y - p[1] || 0;
      return function gesture(type2, event2, touch2) {
        var p0 = p, n;
        switch (type2) {
          case "start":
            gestures[identifier] = gesture, n = active++;
            break;
          case "end":
            delete gestures[identifier], --active;
          case "drag":
            p = pointer_default(touch2 || event2, container2), n = active;
            break;
        }
        dispatch2.call(
          type2,
          that,
          new DragEvent(type2, {
            sourceEvent: event2,
            subject: s,
            target: drag,
            identifier,
            active: n,
            x: p[0] + dx,
            y: p[1] + dy,
            dx: p[0] - p0[0],
            dy: p[1] - p0[1],
            dispatch: dispatch2
          }),
          d
        );
      };
    }
    drag.filter = function(_) {
      return arguments.length ? (filter2 = typeof _ === "function" ? _ : constant_default2(!!_), drag) : filter2;
    };
    drag.container = function(_) {
      return arguments.length ? (container = typeof _ === "function" ? _ : constant_default2(_), drag) : container;
    };
    drag.subject = function(_) {
      return arguments.length ? (subject = typeof _ === "function" ? _ : constant_default2(_), drag) : subject;
    };
    drag.touchable = function(_) {
      return arguments.length ? (touchable = typeof _ === "function" ? _ : constant_default2(!!_), drag) : touchable;
    };
    drag.on = function() {
      var value = listeners.on.apply(listeners, arguments);
      return value === listeners ? drag : value;
    };
    drag.clickDistance = function(_) {
      return arguments.length ? (clickDistance2 = (_ = +_) * _, drag) : Math.sqrt(clickDistance2);
    };
    return drag;
  }

  // node_modules/d3-color/src/define.js
  function define_default(constructor, factory, prototype) {
    constructor.prototype = factory.prototype = prototype;
    prototype.constructor = constructor;
  }
  function extend(parent, definition) {
    var prototype = Object.create(parent.prototype);
    for (var key in definition)
      prototype[key] = definition[key];
    return prototype;
  }

  // node_modules/d3-color/src/color.js
  function Color() {
  }
  var darker = 0.7;
  var brighter = 1 / darker;
  var reI = "\\s*([+-]?\\d+)\\s*";
  var reN = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)\\s*";
  var reP = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)%\\s*";
  var reHex = /^#([0-9a-f]{3,8})$/;
  var reRgbInteger = new RegExp(`^rgb\\(${reI},${reI},${reI}\\)$`);
  var reRgbPercent = new RegExp(`^rgb\\(${reP},${reP},${reP}\\)$`);
  var reRgbaInteger = new RegExp(`^rgba\\(${reI},${reI},${reI},${reN}\\)$`);
  var reRgbaPercent = new RegExp(`^rgba\\(${reP},${reP},${reP},${reN}\\)$`);
  var reHslPercent = new RegExp(`^hsl\\(${reN},${reP},${reP}\\)$`);
  var reHslaPercent = new RegExp(`^hsla\\(${reN},${reP},${reP},${reN}\\)$`);
  var named = {
    aliceblue: 15792383,
    antiquewhite: 16444375,
    aqua: 65535,
    aquamarine: 8388564,
    azure: 15794175,
    beige: 16119260,
    bisque: 16770244,
    black: 0,
    blanchedalmond: 16772045,
    blue: 255,
    blueviolet: 9055202,
    brown: 10824234,
    burlywood: 14596231,
    cadetblue: 6266528,
    chartreuse: 8388352,
    chocolate: 13789470,
    coral: 16744272,
    cornflowerblue: 6591981,
    cornsilk: 16775388,
    crimson: 14423100,
    cyan: 65535,
    darkblue: 139,
    darkcyan: 35723,
    darkgoldenrod: 12092939,
    darkgray: 11119017,
    darkgreen: 25600,
    darkgrey: 11119017,
    darkkhaki: 12433259,
    darkmagenta: 9109643,
    darkolivegreen: 5597999,
    darkorange: 16747520,
    darkorchid: 10040012,
    darkred: 9109504,
    darksalmon: 15308410,
    darkseagreen: 9419919,
    darkslateblue: 4734347,
    darkslategray: 3100495,
    darkslategrey: 3100495,
    darkturquoise: 52945,
    darkviolet: 9699539,
    deeppink: 16716947,
    deepskyblue: 49151,
    dimgray: 6908265,
    dimgrey: 6908265,
    dodgerblue: 2003199,
    firebrick: 11674146,
    floralwhite: 16775920,
    forestgreen: 2263842,
    fuchsia: 16711935,
    gainsboro: 14474460,
    ghostwhite: 16316671,
    gold: 16766720,
    goldenrod: 14329120,
    gray: 8421504,
    green: 32768,
    greenyellow: 11403055,
    grey: 8421504,
    honeydew: 15794160,
    hotpink: 16738740,
    indianred: 13458524,
    indigo: 4915330,
    ivory: 16777200,
    khaki: 15787660,
    lavender: 15132410,
    lavenderblush: 16773365,
    lawngreen: 8190976,
    lemonchiffon: 16775885,
    lightblue: 11393254,
    lightcoral: 15761536,
    lightcyan: 14745599,
    lightgoldenrodyellow: 16448210,
    lightgray: 13882323,
    lightgreen: 9498256,
    lightgrey: 13882323,
    lightpink: 16758465,
    lightsalmon: 16752762,
    lightseagreen: 2142890,
    lightskyblue: 8900346,
    lightslategray: 7833753,
    lightslategrey: 7833753,
    lightsteelblue: 11584734,
    lightyellow: 16777184,
    lime: 65280,
    limegreen: 3329330,
    linen: 16445670,
    magenta: 16711935,
    maroon: 8388608,
    mediumaquamarine: 6737322,
    mediumblue: 205,
    mediumorchid: 12211667,
    mediumpurple: 9662683,
    mediumseagreen: 3978097,
    mediumslateblue: 8087790,
    mediumspringgreen: 64154,
    mediumturquoise: 4772300,
    mediumvioletred: 13047173,
    midnightblue: 1644912,
    mintcream: 16121850,
    mistyrose: 16770273,
    moccasin: 16770229,
    navajowhite: 16768685,
    navy: 128,
    oldlace: 16643558,
    olive: 8421376,
    olivedrab: 7048739,
    orange: 16753920,
    orangered: 16729344,
    orchid: 14315734,
    palegoldenrod: 15657130,
    palegreen: 10025880,
    paleturquoise: 11529966,
    palevioletred: 14381203,
    papayawhip: 16773077,
    peachpuff: 16767673,
    peru: 13468991,
    pink: 16761035,
    plum: 14524637,
    powderblue: 11591910,
    purple: 8388736,
    rebeccapurple: 6697881,
    red: 16711680,
    rosybrown: 12357519,
    royalblue: 4286945,
    saddlebrown: 9127187,
    salmon: 16416882,
    sandybrown: 16032864,
    seagreen: 3050327,
    seashell: 16774638,
    sienna: 10506797,
    silver: 12632256,
    skyblue: 8900331,
    slateblue: 6970061,
    slategray: 7372944,
    slategrey: 7372944,
    snow: 16775930,
    springgreen: 65407,
    steelblue: 4620980,
    tan: 13808780,
    teal: 32896,
    thistle: 14204888,
    tomato: 16737095,
    turquoise: 4251856,
    violet: 15631086,
    wheat: 16113331,
    white: 16777215,
    whitesmoke: 16119285,
    yellow: 16776960,
    yellowgreen: 10145074
  };
  define_default(Color, color, {
    copy(channels) {
      return Object.assign(new this.constructor(), this, channels);
    },
    displayable() {
      return this.rgb().displayable();
    },
    hex: color_formatHex,
    // Deprecated! Use color.formatHex.
    formatHex: color_formatHex,
    formatHex8: color_formatHex8,
    formatHsl: color_formatHsl,
    formatRgb: color_formatRgb,
    toString: color_formatRgb
  });
  function color_formatHex() {
    return this.rgb().formatHex();
  }
  function color_formatHex8() {
    return this.rgb().formatHex8();
  }
  function color_formatHsl() {
    return hslConvert(this).formatHsl();
  }
  function color_formatRgb() {
    return this.rgb().formatRgb();
  }
  function color(format) {
    var m2, l;
    format = (format + "").trim().toLowerCase();
    return (m2 = reHex.exec(format)) ? (l = m2[1].length, m2 = parseInt(m2[1], 16), l === 6 ? rgbn(m2) : l === 3 ? new Rgb(m2 >> 8 & 15 | m2 >> 4 & 240, m2 >> 4 & 15 | m2 & 240, (m2 & 15) << 4 | m2 & 15, 1) : l === 8 ? rgba(m2 >> 24 & 255, m2 >> 16 & 255, m2 >> 8 & 255, (m2 & 255) / 255) : l === 4 ? rgba(m2 >> 12 & 15 | m2 >> 8 & 240, m2 >> 8 & 15 | m2 >> 4 & 240, m2 >> 4 & 15 | m2 & 240, ((m2 & 15) << 4 | m2 & 15) / 255) : null) : (m2 = reRgbInteger.exec(format)) ? new Rgb(m2[1], m2[2], m2[3], 1) : (m2 = reRgbPercent.exec(format)) ? new Rgb(m2[1] * 255 / 100, m2[2] * 255 / 100, m2[3] * 255 / 100, 1) : (m2 = reRgbaInteger.exec(format)) ? rgba(m2[1], m2[2], m2[3], m2[4]) : (m2 = reRgbaPercent.exec(format)) ? rgba(m2[1] * 255 / 100, m2[2] * 255 / 100, m2[3] * 255 / 100, m2[4]) : (m2 = reHslPercent.exec(format)) ? hsla(m2[1], m2[2] / 100, m2[3] / 100, 1) : (m2 = reHslaPercent.exec(format)) ? hsla(m2[1], m2[2] / 100, m2[3] / 100, m2[4]) : named.hasOwnProperty(format) ? rgbn(named[format]) : format === "transparent" ? new Rgb(NaN, NaN, NaN, 0) : null;
  }
  function rgbn(n) {
    return new Rgb(n >> 16 & 255, n >> 8 & 255, n & 255, 1);
  }
  function rgba(r, g, b, a2) {
    if (a2 <= 0)
      r = g = b = NaN;
    return new Rgb(r, g, b, a2);
  }
  function rgbConvert(o) {
    if (!(o instanceof Color))
      o = color(o);
    if (!o)
      return new Rgb();
    o = o.rgb();
    return new Rgb(o.r, o.g, o.b, o.opacity);
  }
  function rgb(r, g, b, opacity) {
    return arguments.length === 1 ? rgbConvert(r) : new Rgb(r, g, b, opacity == null ? 1 : opacity);
  }
  function Rgb(r, g, b, opacity) {
    this.r = +r;
    this.g = +g;
    this.b = +b;
    this.opacity = +opacity;
  }
  define_default(Rgb, rgb, extend(Color, {
    brighter(k) {
      k = k == null ? brighter : Math.pow(brighter, k);
      return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
    },
    darker(k) {
      k = k == null ? darker : Math.pow(darker, k);
      return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
    },
    rgb() {
      return this;
    },
    clamp() {
      return new Rgb(clampi(this.r), clampi(this.g), clampi(this.b), clampa(this.opacity));
    },
    displayable() {
      return -0.5 <= this.r && this.r < 255.5 && (-0.5 <= this.g && this.g < 255.5) && (-0.5 <= this.b && this.b < 255.5) && (0 <= this.opacity && this.opacity <= 1);
    },
    hex: rgb_formatHex,
    // Deprecated! Use color.formatHex.
    formatHex: rgb_formatHex,
    formatHex8: rgb_formatHex8,
    formatRgb: rgb_formatRgb,
    toString: rgb_formatRgb
  }));
  function rgb_formatHex() {
    return `#${hex(this.r)}${hex(this.g)}${hex(this.b)}`;
  }
  function rgb_formatHex8() {
    return `#${hex(this.r)}${hex(this.g)}${hex(this.b)}${hex((isNaN(this.opacity) ? 1 : this.opacity) * 255)}`;
  }
  function rgb_formatRgb() {
    const a2 = clampa(this.opacity);
    return `${a2 === 1 ? "rgb(" : "rgba("}${clampi(this.r)}, ${clampi(this.g)}, ${clampi(this.b)}${a2 === 1 ? ")" : `, ${a2})`}`;
  }
  function clampa(opacity) {
    return isNaN(opacity) ? 1 : Math.max(0, Math.min(1, opacity));
  }
  function clampi(value) {
    return Math.max(0, Math.min(255, Math.round(value) || 0));
  }
  function hex(value) {
    value = clampi(value);
    return (value < 16 ? "0" : "") + value.toString(16);
  }
  function hsla(h, s, l, a2) {
    if (a2 <= 0)
      h = s = l = NaN;
    else if (l <= 0 || l >= 1)
      h = s = NaN;
    else if (s <= 0)
      h = NaN;
    return new Hsl(h, s, l, a2);
  }
  function hslConvert(o) {
    if (o instanceof Hsl)
      return new Hsl(o.h, o.s, o.l, o.opacity);
    if (!(o instanceof Color))
      o = color(o);
    if (!o)
      return new Hsl();
    if (o instanceof Hsl)
      return o;
    o = o.rgb();
    var r = o.r / 255, g = o.g / 255, b = o.b / 255, min2 = Math.min(r, g, b), max2 = Math.max(r, g, b), h = NaN, s = max2 - min2, l = (max2 + min2) / 2;
    if (s) {
      if (r === max2)
        h = (g - b) / s + (g < b) * 6;
      else if (g === max2)
        h = (b - r) / s + 2;
      else
        h = (r - g) / s + 4;
      s /= l < 0.5 ? max2 + min2 : 2 - max2 - min2;
      h *= 60;
    } else {
      s = l > 0 && l < 1 ? 0 : h;
    }
    return new Hsl(h, s, l, o.opacity);
  }
  function hsl(h, s, l, opacity) {
    return arguments.length === 1 ? hslConvert(h) : new Hsl(h, s, l, opacity == null ? 1 : opacity);
  }
  function Hsl(h, s, l, opacity) {
    this.h = +h;
    this.s = +s;
    this.l = +l;
    this.opacity = +opacity;
  }
  define_default(Hsl, hsl, extend(Color, {
    brighter(k) {
      k = k == null ? brighter : Math.pow(brighter, k);
      return new Hsl(this.h, this.s, this.l * k, this.opacity);
    },
    darker(k) {
      k = k == null ? darker : Math.pow(darker, k);
      return new Hsl(this.h, this.s, this.l * k, this.opacity);
    },
    rgb() {
      var h = this.h % 360 + (this.h < 0) * 360, s = isNaN(h) || isNaN(this.s) ? 0 : this.s, l = this.l, m2 = l + (l < 0.5 ? l : 1 - l) * s, m1 = 2 * l - m2;
      return new Rgb(
        hsl2rgb(h >= 240 ? h - 240 : h + 120, m1, m2),
        hsl2rgb(h, m1, m2),
        hsl2rgb(h < 120 ? h + 240 : h - 120, m1, m2),
        this.opacity
      );
    },
    clamp() {
      return new Hsl(clamph(this.h), clampt(this.s), clampt(this.l), clampa(this.opacity));
    },
    displayable() {
      return (0 <= this.s && this.s <= 1 || isNaN(this.s)) && (0 <= this.l && this.l <= 1) && (0 <= this.opacity && this.opacity <= 1);
    },
    formatHsl() {
      const a2 = clampa(this.opacity);
      return `${a2 === 1 ? "hsl(" : "hsla("}${clamph(this.h)}, ${clampt(this.s) * 100}%, ${clampt(this.l) * 100}%${a2 === 1 ? ")" : `, ${a2})`}`;
    }
  }));
  function clamph(value) {
    value = (value || 0) % 360;
    return value < 0 ? value + 360 : value;
  }
  function clampt(value) {
    return Math.max(0, Math.min(1, value || 0));
  }
  function hsl2rgb(h, m1, m2) {
    return (h < 60 ? m1 + (m2 - m1) * h / 60 : h < 180 ? m2 : h < 240 ? m1 + (m2 - m1) * (240 - h) / 60 : m1) * 255;
  }

  // node_modules/d3-interpolate/src/basis.js
  function basis(t1, v0, v1, v2, v3) {
    var t2 = t1 * t1, t3 = t2 * t1;
    return ((1 - 3 * t1 + 3 * t2 - t3) * v0 + (4 - 6 * t2 + 3 * t3) * v1 + (1 + 3 * t1 + 3 * t2 - 3 * t3) * v2 + t3 * v3) / 6;
  }
  function basis_default(values) {
    var n = values.length - 1;
    return function(t) {
      var i = t <= 0 ? t = 0 : t >= 1 ? (t = 1, n - 1) : Math.floor(t * n), v1 = values[i], v2 = values[i + 1], v0 = i > 0 ? values[i - 1] : 2 * v1 - v2, v3 = i < n - 1 ? values[i + 2] : 2 * v2 - v1;
      return basis((t - i / n) * n, v0, v1, v2, v3);
    };
  }

  // node_modules/d3-interpolate/src/basisClosed.js
  function basisClosed_default(values) {
    var n = values.length;
    return function(t) {
      var i = Math.floor(((t %= 1) < 0 ? ++t : t) * n), v0 = values[(i + n - 1) % n], v1 = values[i % n], v2 = values[(i + 1) % n], v3 = values[(i + 2) % n];
      return basis((t - i / n) * n, v0, v1, v2, v3);
    };
  }

  // node_modules/d3-interpolate/src/constant.js
  var constant_default3 = (x3) => () => x3;

  // node_modules/d3-interpolate/src/color.js
  function linear(a2, d) {
    return function(t) {
      return a2 + t * d;
    };
  }
  function exponential(a2, b, y3) {
    return a2 = Math.pow(a2, y3), b = Math.pow(b, y3) - a2, y3 = 1 / y3, function(t) {
      return Math.pow(a2 + t * b, y3);
    };
  }
  function gamma(y3) {
    return (y3 = +y3) === 1 ? nogamma : function(a2, b) {
      return b - a2 ? exponential(a2, b, y3) : constant_default3(isNaN(a2) ? b : a2);
    };
  }
  function nogamma(a2, b) {
    var d = b - a2;
    return d ? linear(a2, d) : constant_default3(isNaN(a2) ? b : a2);
  }

  // node_modules/d3-interpolate/src/rgb.js
  var rgb_default = function rgbGamma(y3) {
    var color2 = gamma(y3);
    function rgb2(start2, end) {
      var r = color2((start2 = rgb(start2)).r, (end = rgb(end)).r), g = color2(start2.g, end.g), b = color2(start2.b, end.b), opacity = nogamma(start2.opacity, end.opacity);
      return function(t) {
        start2.r = r(t);
        start2.g = g(t);
        start2.b = b(t);
        start2.opacity = opacity(t);
        return start2 + "";
      };
    }
    rgb2.gamma = rgbGamma;
    return rgb2;
  }(1);
  function rgbSpline(spline) {
    return function(colors) {
      var n = colors.length, r = new Array(n), g = new Array(n), b = new Array(n), i, color2;
      for (i = 0; i < n; ++i) {
        color2 = rgb(colors[i]);
        r[i] = color2.r || 0;
        g[i] = color2.g || 0;
        b[i] = color2.b || 0;
      }
      r = spline(r);
      g = spline(g);
      b = spline(b);
      color2.opacity = 1;
      return function(t) {
        color2.r = r(t);
        color2.g = g(t);
        color2.b = b(t);
        return color2 + "";
      };
    };
  }
  var rgbBasis = rgbSpline(basis_default);
  var rgbBasisClosed = rgbSpline(basisClosed_default);

  // node_modules/d3-interpolate/src/number.js
  function number_default(a2, b) {
    return a2 = +a2, b = +b, function(t) {
      return a2 * (1 - t) + b * t;
    };
  }

  // node_modules/d3-interpolate/src/string.js
  var reA = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g;
  var reB = new RegExp(reA.source, "g");
  function zero(b) {
    return function() {
      return b;
    };
  }
  function one(b) {
    return function(t) {
      return b(t) + "";
    };
  }
  function string_default(a2, b) {
    var bi = reA.lastIndex = reB.lastIndex = 0, am, bm, bs, i = -1, s = [], q = [];
    a2 = a2 + "", b = b + "";
    while ((am = reA.exec(a2)) && (bm = reB.exec(b))) {
      if ((bs = bm.index) > bi) {
        bs = b.slice(bi, bs);
        if (s[i])
          s[i] += bs;
        else
          s[++i] = bs;
      }
      if ((am = am[0]) === (bm = bm[0])) {
        if (s[i])
          s[i] += bm;
        else
          s[++i] = bm;
      } else {
        s[++i] = null;
        q.push({ i, x: number_default(am, bm) });
      }
      bi = reB.lastIndex;
    }
    if (bi < b.length) {
      bs = b.slice(bi);
      if (s[i])
        s[i] += bs;
      else
        s[++i] = bs;
    }
    return s.length < 2 ? q[0] ? one(q[0].x) : zero(b) : (b = q.length, function(t) {
      for (var i2 = 0, o; i2 < b; ++i2)
        s[(o = q[i2]).i] = o.x(t);
      return s.join("");
    });
  }

  // node_modules/d3-interpolate/src/transform/decompose.js
  var degrees = 180 / Math.PI;
  var identity2 = {
    translateX: 0,
    translateY: 0,
    rotate: 0,
    skewX: 0,
    scaleX: 1,
    scaleY: 1
  };
  function decompose_default(a2, b, c2, d, e, f) {
    var scaleX, scaleY, skewX;
    if (scaleX = Math.sqrt(a2 * a2 + b * b))
      a2 /= scaleX, b /= scaleX;
    if (skewX = a2 * c2 + b * d)
      c2 -= a2 * skewX, d -= b * skewX;
    if (scaleY = Math.sqrt(c2 * c2 + d * d))
      c2 /= scaleY, d /= scaleY, skewX /= scaleY;
    if (a2 * d < b * c2)
      a2 = -a2, b = -b, skewX = -skewX, scaleX = -scaleX;
    return {
      translateX: e,
      translateY: f,
      rotate: Math.atan2(b, a2) * degrees,
      skewX: Math.atan(skewX) * degrees,
      scaleX,
      scaleY
    };
  }

  // node_modules/d3-interpolate/src/transform/parse.js
  var svgNode;
  function parseCss(value) {
    const m2 = new (typeof DOMMatrix === "function" ? DOMMatrix : WebKitCSSMatrix)(value + "");
    return m2.isIdentity ? identity2 : decompose_default(m2.a, m2.b, m2.c, m2.d, m2.e, m2.f);
  }
  function parseSvg(value) {
    if (value == null)
      return identity2;
    if (!svgNode)
      svgNode = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svgNode.setAttribute("transform", value);
    if (!(value = svgNode.transform.baseVal.consolidate()))
      return identity2;
    value = value.matrix;
    return decompose_default(value.a, value.b, value.c, value.d, value.e, value.f);
  }

  // node_modules/d3-interpolate/src/transform/index.js
  function interpolateTransform(parse, pxComma, pxParen, degParen) {
    function pop(s) {
      return s.length ? s.pop() + " " : "";
    }
    function translate(xa, ya, xb, yb, s, q) {
      if (xa !== xb || ya !== yb) {
        var i = s.push("translate(", null, pxComma, null, pxParen);
        q.push({ i: i - 4, x: number_default(xa, xb) }, { i: i - 2, x: number_default(ya, yb) });
      } else if (xb || yb) {
        s.push("translate(" + xb + pxComma + yb + pxParen);
      }
    }
    function rotate(a2, b, s, q) {
      if (a2 !== b) {
        if (a2 - b > 180)
          b += 360;
        else if (b - a2 > 180)
          a2 += 360;
        q.push({ i: s.push(pop(s) + "rotate(", null, degParen) - 2, x: number_default(a2, b) });
      } else if (b) {
        s.push(pop(s) + "rotate(" + b + degParen);
      }
    }
    function skewX(a2, b, s, q) {
      if (a2 !== b) {
        q.push({ i: s.push(pop(s) + "skewX(", null, degParen) - 2, x: number_default(a2, b) });
      } else if (b) {
        s.push(pop(s) + "skewX(" + b + degParen);
      }
    }
    function scale(xa, ya, xb, yb, s, q) {
      if (xa !== xb || ya !== yb) {
        var i = s.push(pop(s) + "scale(", null, ",", null, ")");
        q.push({ i: i - 4, x: number_default(xa, xb) }, { i: i - 2, x: number_default(ya, yb) });
      } else if (xb !== 1 || yb !== 1) {
        s.push(pop(s) + "scale(" + xb + "," + yb + ")");
      }
    }
    return function(a2, b) {
      var s = [], q = [];
      a2 = parse(a2), b = parse(b);
      translate(a2.translateX, a2.translateY, b.translateX, b.translateY, s, q);
      rotate(a2.rotate, b.rotate, s, q);
      skewX(a2.skewX, b.skewX, s, q);
      scale(a2.scaleX, a2.scaleY, b.scaleX, b.scaleY, s, q);
      a2 = b = null;
      return function(t) {
        var i = -1, n = q.length, o;
        while (++i < n)
          s[(o = q[i]).i] = o.x(t);
        return s.join("");
      };
    };
  }
  var interpolateTransformCss = interpolateTransform(parseCss, "px, ", "px)", "deg)");
  var interpolateTransformSvg = interpolateTransform(parseSvg, ", ", ")", ")");

  // node_modules/d3-interpolate/src/zoom.js
  var epsilon2 = 1e-12;
  function cosh(x3) {
    return ((x3 = Math.exp(x3)) + 1 / x3) / 2;
  }
  function sinh(x3) {
    return ((x3 = Math.exp(x3)) - 1 / x3) / 2;
  }
  function tanh(x3) {
    return ((x3 = Math.exp(2 * x3)) - 1) / (x3 + 1);
  }
  var zoom_default = function zoomRho(rho, rho2, rho4) {
    function zoom(p0, p1) {
      var ux0 = p0[0], uy0 = p0[1], w0 = p0[2], ux1 = p1[0], uy1 = p1[1], w1 = p1[2], dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy, i, S;
      if (d2 < epsilon2) {
        S = Math.log(w1 / w0) / rho;
        i = function(t) {
          return [
            ux0 + t * dx,
            uy0 + t * dy,
            w0 * Math.exp(rho * t * S)
          ];
        };
      } else {
        var d1 = Math.sqrt(d2), b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1), b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1), r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
        S = (r1 - r0) / rho;
        i = function(t) {
          var s = t * S, coshr0 = cosh(r0), u = w0 / (rho2 * d1) * (coshr0 * tanh(rho * s + r0) - sinh(r0));
          return [
            ux0 + u * dx,
            uy0 + u * dy,
            w0 * coshr0 / cosh(rho * s + r0)
          ];
        };
      }
      i.duration = S * 1e3 * rho / Math.SQRT2;
      return i;
    }
    zoom.rho = function(_) {
      var _1 = Math.max(1e-3, +_), _2 = _1 * _1, _4 = _2 * _2;
      return zoomRho(_1, _2, _4);
    };
    return zoom;
  }(Math.SQRT2, 2, 4);

  // node_modules/d3-timer/src/timer.js
  var frame = 0;
  var timeout = 0;
  var interval = 0;
  var pokeDelay = 1e3;
  var taskHead;
  var taskTail;
  var clockLast = 0;
  var clockNow = 0;
  var clockSkew = 0;
  var clock = typeof performance === "object" && performance.now ? performance : Date;
  var setFrame = typeof window === "object" && window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function(f) {
    setTimeout(f, 17);
  };
  function now2() {
    return clockNow || (setFrame(clearNow), clockNow = clock.now() + clockSkew);
  }
  function clearNow() {
    clockNow = 0;
  }
  function Timer() {
    this._call = this._time = this._next = null;
  }
  Timer.prototype = timer.prototype = {
    constructor: Timer,
    restart: function(callback, delay, time) {
      if (typeof callback !== "function")
        throw new TypeError("callback is not a function");
      time = (time == null ? now2() : +time) + (delay == null ? 0 : +delay);
      if (!this._next && taskTail !== this) {
        if (taskTail)
          taskTail._next = this;
        else
          taskHead = this;
        taskTail = this;
      }
      this._call = callback;
      this._time = time;
      sleep();
    },
    stop: function() {
      if (this._call) {
        this._call = null;
        this._time = Infinity;
        sleep();
      }
    }
  };
  function timer(callback, delay, time) {
    var t = new Timer();
    t.restart(callback, delay, time);
    return t;
  }
  function timerFlush() {
    now2();
    ++frame;
    var t = taskHead, e;
    while (t) {
      if ((e = clockNow - t._time) >= 0)
        t._call.call(void 0, e);
      t = t._next;
    }
    --frame;
  }
  function wake() {
    clockNow = (clockLast = clock.now()) + clockSkew;
    frame = timeout = 0;
    try {
      timerFlush();
    } finally {
      frame = 0;
      nap();
      clockNow = 0;
    }
  }
  function poke() {
    var now3 = clock.now(), delay = now3 - clockLast;
    if (delay > pokeDelay)
      clockSkew -= delay, clockLast = now3;
  }
  function nap() {
    var t0, t1 = taskHead, t2, time = Infinity;
    while (t1) {
      if (t1._call) {
        if (time > t1._time)
          time = t1._time;
        t0 = t1, t1 = t1._next;
      } else {
        t2 = t1._next, t1._next = null;
        t1 = t0 ? t0._next = t2 : taskHead = t2;
      }
    }
    taskTail = t0;
    sleep(time);
  }
  function sleep(time) {
    if (frame)
      return;
    if (timeout)
      timeout = clearTimeout(timeout);
    var delay = time - clockNow;
    if (delay > 24) {
      if (time < Infinity)
        timeout = setTimeout(wake, time - clock.now() - clockSkew);
      if (interval)
        interval = clearInterval(interval);
    } else {
      if (!interval)
        clockLast = clock.now(), interval = setInterval(poke, pokeDelay);
      frame = 1, setFrame(wake);
    }
  }

  // node_modules/d3-timer/src/timeout.js
  function timeout_default(callback, delay, time) {
    var t = new Timer();
    delay = delay == null ? 0 : +delay;
    t.restart((elapsed) => {
      t.stop();
      callback(elapsed + delay);
    }, delay, time);
    return t;
  }

  // node_modules/d3-transition/src/transition/schedule.js
  var emptyOn = dispatch_default("start", "end", "cancel", "interrupt");
  var emptyTween = [];
  var CREATED = 0;
  var SCHEDULED = 1;
  var STARTING = 2;
  var STARTED = 3;
  var RUNNING = 4;
  var ENDING = 5;
  var ENDED = 6;
  function schedule_default(node, name, id2, index2, group, timing) {
    var schedules = node.__transition;
    if (!schedules)
      node.__transition = {};
    else if (id2 in schedules)
      return;
    create(node, id2, {
      name,
      index: index2,
      // For context during callback.
      group,
      // For context during callback.
      on: emptyOn,
      tween: emptyTween,
      time: timing.time,
      delay: timing.delay,
      duration: timing.duration,
      ease: timing.ease,
      timer: null,
      state: CREATED
    });
  }
  function init2(node, id2) {
    var schedule = get2(node, id2);
    if (schedule.state > CREATED)
      throw new Error("too late; already scheduled");
    return schedule;
  }
  function set2(node, id2) {
    var schedule = get2(node, id2);
    if (schedule.state > STARTED)
      throw new Error("too late; already running");
    return schedule;
  }
  function get2(node, id2) {
    var schedule = node.__transition;
    if (!schedule || !(schedule = schedule[id2]))
      throw new Error("transition not found");
    return schedule;
  }
  function create(node, id2, self) {
    var schedules = node.__transition, tween;
    schedules[id2] = self;
    self.timer = timer(schedule, 0, self.time);
    function schedule(elapsed) {
      self.state = SCHEDULED;
      self.timer.restart(start2, self.delay, self.time);
      if (self.delay <= elapsed)
        start2(elapsed - self.delay);
    }
    function start2(elapsed) {
      var i, j, n, o;
      if (self.state !== SCHEDULED)
        return stop();
      for (i in schedules) {
        o = schedules[i];
        if (o.name !== self.name)
          continue;
        if (o.state === STARTED)
          return timeout_default(start2);
        if (o.state === RUNNING) {
          o.state = ENDED;
          o.timer.stop();
          o.on.call("interrupt", node, node.__data__, o.index, o.group);
          delete schedules[i];
        } else if (+i < id2) {
          o.state = ENDED;
          o.timer.stop();
          o.on.call("cancel", node, node.__data__, o.index, o.group);
          delete schedules[i];
        }
      }
      timeout_default(function() {
        if (self.state === STARTED) {
          self.state = RUNNING;
          self.timer.restart(tick2, self.delay, self.time);
          tick2(elapsed);
        }
      });
      self.state = STARTING;
      self.on.call("start", node, node.__data__, self.index, self.group);
      if (self.state !== STARTING)
        return;
      self.state = STARTED;
      tween = new Array(n = self.tween.length);
      for (i = 0, j = -1; i < n; ++i) {
        if (o = self.tween[i].value.call(node, node.__data__, self.index, self.group)) {
          tween[++j] = o;
        }
      }
      tween.length = j + 1;
    }
    function tick2(elapsed) {
      var t = elapsed < self.duration ? self.ease.call(null, elapsed / self.duration) : (self.timer.restart(stop), self.state = ENDING, 1), i = -1, n = tween.length;
      while (++i < n) {
        tween[i].call(node, t);
      }
      if (self.state === ENDING) {
        self.on.call("end", node, node.__data__, self.index, self.group);
        stop();
      }
    }
    function stop() {
      self.state = ENDED;
      self.timer.stop();
      delete schedules[id2];
      for (var i in schedules)
        return;
      delete node.__transition;
    }
  }

  // node_modules/d3-transition/src/interrupt.js
  function interrupt_default(node, name) {
    var schedules = node.__transition, schedule, active, empty3 = true, i;
    if (!schedules)
      return;
    name = name == null ? null : name + "";
    for (i in schedules) {
      if ((schedule = schedules[i]).name !== name) {
        empty3 = false;
        continue;
      }
      active = schedule.state > STARTING && schedule.state < ENDING;
      schedule.state = ENDED;
      schedule.timer.stop();
      schedule.on.call(active ? "interrupt" : "cancel", node, node.__data__, schedule.index, schedule.group);
      delete schedules[i];
    }
    if (empty3)
      delete node.__transition;
  }

  // node_modules/d3-transition/src/selection/interrupt.js
  function interrupt_default2(name) {
    return this.each(function() {
      interrupt_default(this, name);
    });
  }

  // node_modules/d3-transition/src/transition/tween.js
  function tweenRemove(id2, name) {
    var tween0, tween1;
    return function() {
      var schedule = set2(this, id2), tween = schedule.tween;
      if (tween !== tween0) {
        tween1 = tween0 = tween;
        for (var i = 0, n = tween1.length; i < n; ++i) {
          if (tween1[i].name === name) {
            tween1 = tween1.slice();
            tween1.splice(i, 1);
            break;
          }
        }
      }
      schedule.tween = tween1;
    };
  }
  function tweenFunction(id2, name, value) {
    var tween0, tween1;
    if (typeof value !== "function")
      throw new Error();
    return function() {
      var schedule = set2(this, id2), tween = schedule.tween;
      if (tween !== tween0) {
        tween1 = (tween0 = tween).slice();
        for (var t = { name, value }, i = 0, n = tween1.length; i < n; ++i) {
          if (tween1[i].name === name) {
            tween1[i] = t;
            break;
          }
        }
        if (i === n)
          tween1.push(t);
      }
      schedule.tween = tween1;
    };
  }
  function tween_default(name, value) {
    var id2 = this._id;
    name += "";
    if (arguments.length < 2) {
      var tween = get2(this.node(), id2).tween;
      for (var i = 0, n = tween.length, t; i < n; ++i) {
        if ((t = tween[i]).name === name) {
          return t.value;
        }
      }
      return null;
    }
    return this.each((value == null ? tweenRemove : tweenFunction)(id2, name, value));
  }
  function tweenValue(transition2, name, value) {
    var id2 = transition2._id;
    transition2.each(function() {
      var schedule = set2(this, id2);
      (schedule.value || (schedule.value = {}))[name] = value.apply(this, arguments);
    });
    return function(node) {
      return get2(node, id2).value[name];
    };
  }

  // node_modules/d3-transition/src/transition/interpolate.js
  function interpolate_default(a2, b) {
    var c2;
    return (typeof b === "number" ? number_default : b instanceof color ? rgb_default : (c2 = color(b)) ? (b = c2, rgb_default) : string_default)(a2, b);
  }

  // node_modules/d3-transition/src/transition/attr.js
  function attrRemove2(name) {
    return function() {
      this.removeAttribute(name);
    };
  }
  function attrRemoveNS2(fullname) {
    return function() {
      this.removeAttributeNS(fullname.space, fullname.local);
    };
  }
  function attrConstant2(name, interpolate, value1) {
    var string00, string1 = value1 + "", interpolate0;
    return function() {
      var string0 = this.getAttribute(name);
      return string0 === string1 ? null : string0 === string00 ? interpolate0 : interpolate0 = interpolate(string00 = string0, value1);
    };
  }
  function attrConstantNS2(fullname, interpolate, value1) {
    var string00, string1 = value1 + "", interpolate0;
    return function() {
      var string0 = this.getAttributeNS(fullname.space, fullname.local);
      return string0 === string1 ? null : string0 === string00 ? interpolate0 : interpolate0 = interpolate(string00 = string0, value1);
    };
  }
  function attrFunction2(name, interpolate, value) {
    var string00, string10, interpolate0;
    return function() {
      var string0, value1 = value(this), string1;
      if (value1 == null)
        return void this.removeAttribute(name);
      string0 = this.getAttribute(name);
      string1 = value1 + "";
      return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : (string10 = string1, interpolate0 = interpolate(string00 = string0, value1));
    };
  }
  function attrFunctionNS2(fullname, interpolate, value) {
    var string00, string10, interpolate0;
    return function() {
      var string0, value1 = value(this), string1;
      if (value1 == null)
        return void this.removeAttributeNS(fullname.space, fullname.local);
      string0 = this.getAttributeNS(fullname.space, fullname.local);
      string1 = value1 + "";
      return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : (string10 = string1, interpolate0 = interpolate(string00 = string0, value1));
    };
  }
  function attr_default2(name, value) {
    var fullname = namespace_default(name), i = fullname === "transform" ? interpolateTransformSvg : interpolate_default;
    return this.attrTween(name, typeof value === "function" ? (fullname.local ? attrFunctionNS2 : attrFunction2)(fullname, i, tweenValue(this, "attr." + name, value)) : value == null ? (fullname.local ? attrRemoveNS2 : attrRemove2)(fullname) : (fullname.local ? attrConstantNS2 : attrConstant2)(fullname, i, value));
  }

  // node_modules/d3-transition/src/transition/attrTween.js
  function attrInterpolate(name, i) {
    return function(t) {
      this.setAttribute(name, i.call(this, t));
    };
  }
  function attrInterpolateNS(fullname, i) {
    return function(t) {
      this.setAttributeNS(fullname.space, fullname.local, i.call(this, t));
    };
  }
  function attrTweenNS(fullname, value) {
    var t0, i0;
    function tween() {
      var i = value.apply(this, arguments);
      if (i !== i0)
        t0 = (i0 = i) && attrInterpolateNS(fullname, i);
      return t0;
    }
    tween._value = value;
    return tween;
  }
  function attrTween(name, value) {
    var t0, i0;
    function tween() {
      var i = value.apply(this, arguments);
      if (i !== i0)
        t0 = (i0 = i) && attrInterpolate(name, i);
      return t0;
    }
    tween._value = value;
    return tween;
  }
  function attrTween_default(name, value) {
    var key = "attr." + name;
    if (arguments.length < 2)
      return (key = this.tween(key)) && key._value;
    if (value == null)
      return this.tween(key, null);
    if (typeof value !== "function")
      throw new Error();
    var fullname = namespace_default(name);
    return this.tween(key, (fullname.local ? attrTweenNS : attrTween)(fullname, value));
  }

  // node_modules/d3-transition/src/transition/delay.js
  function delayFunction(id2, value) {
    return function() {
      init2(this, id2).delay = +value.apply(this, arguments);
    };
  }
  function delayConstant(id2, value) {
    return value = +value, function() {
      init2(this, id2).delay = value;
    };
  }
  function delay_default(value) {
    var id2 = this._id;
    return arguments.length ? this.each((typeof value === "function" ? delayFunction : delayConstant)(id2, value)) : get2(this.node(), id2).delay;
  }

  // node_modules/d3-transition/src/transition/duration.js
  function durationFunction(id2, value) {
    return function() {
      set2(this, id2).duration = +value.apply(this, arguments);
    };
  }
  function durationConstant(id2, value) {
    return value = +value, function() {
      set2(this, id2).duration = value;
    };
  }
  function duration_default(value) {
    var id2 = this._id;
    return arguments.length ? this.each((typeof value === "function" ? durationFunction : durationConstant)(id2, value)) : get2(this.node(), id2).duration;
  }

  // node_modules/d3-transition/src/transition/ease.js
  function easeConstant(id2, value) {
    if (typeof value !== "function")
      throw new Error();
    return function() {
      set2(this, id2).ease = value;
    };
  }
  function ease_default(value) {
    var id2 = this._id;
    return arguments.length ? this.each(easeConstant(id2, value)) : get2(this.node(), id2).ease;
  }

  // node_modules/d3-transition/src/transition/easeVarying.js
  function easeVarying(id2, value) {
    return function() {
      var v = value.apply(this, arguments);
      if (typeof v !== "function")
        throw new Error();
      set2(this, id2).ease = v;
    };
  }
  function easeVarying_default(value) {
    if (typeof value !== "function")
      throw new Error();
    return this.each(easeVarying(this._id, value));
  }

  // node_modules/d3-transition/src/transition/filter.js
  function filter_default2(match) {
    if (typeof match !== "function")
      match = matcher_default(match);
    for (var groups = this._groups, m2 = groups.length, subgroups = new Array(m2), j = 0; j < m2; ++j) {
      for (var group = groups[j], n = group.length, subgroup = subgroups[j] = [], node, i = 0; i < n; ++i) {
        if ((node = group[i]) && match.call(node, node.__data__, i, group)) {
          subgroup.push(node);
        }
      }
    }
    return new Transition(subgroups, this._parents, this._name, this._id);
  }

  // node_modules/d3-transition/src/transition/merge.js
  function merge_default2(transition2) {
    if (transition2._id !== this._id)
      throw new Error();
    for (var groups0 = this._groups, groups1 = transition2._groups, m0 = groups0.length, m1 = groups1.length, m2 = Math.min(m0, m1), merges = new Array(m0), j = 0; j < m2; ++j) {
      for (var group0 = groups0[j], group1 = groups1[j], n = group0.length, merge = merges[j] = new Array(n), node, i = 0; i < n; ++i) {
        if (node = group0[i] || group1[i]) {
          merge[i] = node;
        }
      }
    }
    for (; j < m0; ++j) {
      merges[j] = groups0[j];
    }
    return new Transition(merges, this._parents, this._name, this._id);
  }

  // node_modules/d3-transition/src/transition/on.js
  function start(name) {
    return (name + "").trim().split(/^|\s+/).every(function(t) {
      var i = t.indexOf(".");
      if (i >= 0)
        t = t.slice(0, i);
      return !t || t === "start";
    });
  }
  function onFunction(id2, name, listener) {
    var on0, on1, sit = start(name) ? init2 : set2;
    return function() {
      var schedule = sit(this, id2), on = schedule.on;
      if (on !== on0)
        (on1 = (on0 = on).copy()).on(name, listener);
      schedule.on = on1;
    };
  }
  function on_default2(name, listener) {
    var id2 = this._id;
    return arguments.length < 2 ? get2(this.node(), id2).on.on(name) : this.each(onFunction(id2, name, listener));
  }

  // node_modules/d3-transition/src/transition/remove.js
  function removeFunction(id2) {
    return function() {
      var parent = this.parentNode;
      for (var i in this.__transition)
        if (+i !== id2)
          return;
      if (parent)
        parent.removeChild(this);
    };
  }
  function remove_default2() {
    return this.on("end.remove", removeFunction(this._id));
  }

  // node_modules/d3-transition/src/transition/select.js
  function select_default3(select) {
    var name = this._name, id2 = this._id;
    if (typeof select !== "function")
      select = selector_default(select);
    for (var groups = this._groups, m2 = groups.length, subgroups = new Array(m2), j = 0; j < m2; ++j) {
      for (var group = groups[j], n = group.length, subgroup = subgroups[j] = new Array(n), node, subnode, i = 0; i < n; ++i) {
        if ((node = group[i]) && (subnode = select.call(node, node.__data__, i, group))) {
          if ("__data__" in node)
            subnode.__data__ = node.__data__;
          subgroup[i] = subnode;
          schedule_default(subgroup[i], name, id2, i, subgroup, get2(node, id2));
        }
      }
    }
    return new Transition(subgroups, this._parents, name, id2);
  }

  // node_modules/d3-transition/src/transition/selectAll.js
  function selectAll_default2(select) {
    var name = this._name, id2 = this._id;
    if (typeof select !== "function")
      select = selectorAll_default(select);
    for (var groups = this._groups, m2 = groups.length, subgroups = [], parents = [], j = 0; j < m2; ++j) {
      for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
        if (node = group[i]) {
          for (var children3 = select.call(node, node.__data__, i, group), child, inherit2 = get2(node, id2), k = 0, l = children3.length; k < l; ++k) {
            if (child = children3[k]) {
              schedule_default(child, name, id2, k, children3, inherit2);
            }
          }
          subgroups.push(children3);
          parents.push(node);
        }
      }
    }
    return new Transition(subgroups, parents, name, id2);
  }

  // node_modules/d3-transition/src/transition/selection.js
  var Selection2 = selection_default.prototype.constructor;
  function selection_default2() {
    return new Selection2(this._groups, this._parents);
  }

  // node_modules/d3-transition/src/transition/style.js
  function styleNull(name, interpolate) {
    var string00, string10, interpolate0;
    return function() {
      var string0 = styleValue(this, name), string1 = (this.style.removeProperty(name), styleValue(this, name));
      return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : interpolate0 = interpolate(string00 = string0, string10 = string1);
    };
  }
  function styleRemove2(name) {
    return function() {
      this.style.removeProperty(name);
    };
  }
  function styleConstant2(name, interpolate, value1) {
    var string00, string1 = value1 + "", interpolate0;
    return function() {
      var string0 = styleValue(this, name);
      return string0 === string1 ? null : string0 === string00 ? interpolate0 : interpolate0 = interpolate(string00 = string0, value1);
    };
  }
  function styleFunction2(name, interpolate, value) {
    var string00, string10, interpolate0;
    return function() {
      var string0 = styleValue(this, name), value1 = value(this), string1 = value1 + "";
      if (value1 == null)
        string1 = value1 = (this.style.removeProperty(name), styleValue(this, name));
      return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : (string10 = string1, interpolate0 = interpolate(string00 = string0, value1));
    };
  }
  function styleMaybeRemove(id2, name) {
    var on0, on1, listener0, key = "style." + name, event = "end." + key, remove2;
    return function() {
      var schedule = set2(this, id2), on = schedule.on, listener = schedule.value[key] == null ? remove2 || (remove2 = styleRemove2(name)) : void 0;
      if (on !== on0 || listener0 !== listener)
        (on1 = (on0 = on).copy()).on(event, listener0 = listener);
      schedule.on = on1;
    };
  }
  function style_default2(name, value, priority) {
    var i = (name += "") === "transform" ? interpolateTransformCss : interpolate_default;
    return value == null ? this.styleTween(name, styleNull(name, i)).on("end.style." + name, styleRemove2(name)) : typeof value === "function" ? this.styleTween(name, styleFunction2(name, i, tweenValue(this, "style." + name, value))).each(styleMaybeRemove(this._id, name)) : this.styleTween(name, styleConstant2(name, i, value), priority).on("end.style." + name, null);
  }

  // node_modules/d3-transition/src/transition/styleTween.js
  function styleInterpolate(name, i, priority) {
    return function(t) {
      this.style.setProperty(name, i.call(this, t), priority);
    };
  }
  function styleTween(name, value, priority) {
    var t, i0;
    function tween() {
      var i = value.apply(this, arguments);
      if (i !== i0)
        t = (i0 = i) && styleInterpolate(name, i, priority);
      return t;
    }
    tween._value = value;
    return tween;
  }
  function styleTween_default(name, value, priority) {
    var key = "style." + (name += "");
    if (arguments.length < 2)
      return (key = this.tween(key)) && key._value;
    if (value == null)
      return this.tween(key, null);
    if (typeof value !== "function")
      throw new Error();
    return this.tween(key, styleTween(name, value, priority == null ? "" : priority));
  }

  // node_modules/d3-transition/src/transition/text.js
  function textConstant2(value) {
    return function() {
      this.textContent = value;
    };
  }
  function textFunction2(value) {
    return function() {
      var value1 = value(this);
      this.textContent = value1 == null ? "" : value1;
    };
  }
  function text_default2(value) {
    return this.tween("text", typeof value === "function" ? textFunction2(tweenValue(this, "text", value)) : textConstant2(value == null ? "" : value + ""));
  }

  // node_modules/d3-transition/src/transition/textTween.js
  function textInterpolate(i) {
    return function(t) {
      this.textContent = i.call(this, t);
    };
  }
  function textTween(value) {
    var t0, i0;
    function tween() {
      var i = value.apply(this, arguments);
      if (i !== i0)
        t0 = (i0 = i) && textInterpolate(i);
      return t0;
    }
    tween._value = value;
    return tween;
  }
  function textTween_default(value) {
    var key = "text";
    if (arguments.length < 1)
      return (key = this.tween(key)) && key._value;
    if (value == null)
      return this.tween(key, null);
    if (typeof value !== "function")
      throw new Error();
    return this.tween(key, textTween(value));
  }

  // node_modules/d3-transition/src/transition/transition.js
  function transition_default() {
    var name = this._name, id0 = this._id, id1 = newId();
    for (var groups = this._groups, m2 = groups.length, j = 0; j < m2; ++j) {
      for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
        if (node = group[i]) {
          var inherit2 = get2(node, id0);
          schedule_default(node, name, id1, i, group, {
            time: inherit2.time + inherit2.delay + inherit2.duration,
            delay: 0,
            duration: inherit2.duration,
            ease: inherit2.ease
          });
        }
      }
    }
    return new Transition(groups, this._parents, name, id1);
  }

  // node_modules/d3-transition/src/transition/end.js
  function end_default() {
    var on0, on1, that = this, id2 = that._id, size = that.size();
    return new Promise(function(resolve, reject) {
      var cancel = { value: reject }, end = { value: function() {
        if (--size === 0)
          resolve();
      } };
      that.each(function() {
        var schedule = set2(this, id2), on = schedule.on;
        if (on !== on0) {
          on1 = (on0 = on).copy();
          on1._.cancel.push(cancel);
          on1._.interrupt.push(cancel);
          on1._.end.push(end);
        }
        schedule.on = on1;
      });
      if (size === 0)
        resolve();
    });
  }

  // node_modules/d3-transition/src/transition/index.js
  var id = 0;
  function Transition(groups, parents, name, id2) {
    this._groups = groups;
    this._parents = parents;
    this._name = name;
    this._id = id2;
  }
  function transition(name) {
    return selection_default().transition(name);
  }
  function newId() {
    return ++id;
  }
  var selection_prototype = selection_default.prototype;
  Transition.prototype = transition.prototype = {
    constructor: Transition,
    select: select_default3,
    selectAll: selectAll_default2,
    selectChild: selection_prototype.selectChild,
    selectChildren: selection_prototype.selectChildren,
    filter: filter_default2,
    merge: merge_default2,
    selection: selection_default2,
    transition: transition_default,
    call: selection_prototype.call,
    nodes: selection_prototype.nodes,
    node: selection_prototype.node,
    size: selection_prototype.size,
    empty: selection_prototype.empty,
    each: selection_prototype.each,
    on: on_default2,
    attr: attr_default2,
    attrTween: attrTween_default,
    style: style_default2,
    styleTween: styleTween_default,
    text: text_default2,
    textTween: textTween_default,
    remove: remove_default2,
    tween: tween_default,
    delay: delay_default,
    duration: duration_default,
    ease: ease_default,
    easeVarying: easeVarying_default,
    end: end_default,
    [Symbol.iterator]: selection_prototype[Symbol.iterator]
  };

  // node_modules/d3-ease/src/cubic.js
  function cubicInOut(t) {
    return ((t *= 2) <= 1 ? t * t * t : (t -= 2) * t * t + 2) / 2;
  }

  // node_modules/d3-transition/src/selection/transition.js
  var defaultTiming = {
    time: null,
    // Set on use.
    delay: 0,
    duration: 250,
    ease: cubicInOut
  };
  function inherit(node, id2) {
    var timing;
    while (!(timing = node.__transition) || !(timing = timing[id2])) {
      if (!(node = node.parentNode)) {
        throw new Error(`transition ${id2} not found`);
      }
    }
    return timing;
  }
  function transition_default2(name) {
    var id2, timing;
    if (name instanceof Transition) {
      id2 = name._id, name = name._name;
    } else {
      id2 = newId(), (timing = defaultTiming).time = now2(), name = name == null ? null : name + "";
    }
    for (var groups = this._groups, m2 = groups.length, j = 0; j < m2; ++j) {
      for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
        if (node = group[i]) {
          schedule_default(node, name, id2, i, group, timing || inherit(node, id2));
        }
      }
    }
    return new Transition(groups, this._parents, name, id2);
  }

  // node_modules/d3-transition/src/selection/index.js
  selection_default.prototype.interrupt = interrupt_default2;
  selection_default.prototype.transition = transition_default2;

  // node_modules/d3-brush/src/brush.js
  var { abs, max, min } = Math;
  function number1(e) {
    return [+e[0], +e[1]];
  }
  function number2(e) {
    return [number1(e[0]), number1(e[1])];
  }
  var X2 = {
    name: "x",
    handles: ["w", "e"].map(type),
    input: function(x3, e) {
      return x3 == null ? null : [[+x3[0], e[0][1]], [+x3[1], e[1][1]]];
    },
    output: function(xy) {
      return xy && [xy[0][0], xy[1][0]];
    }
  };
  var Y = {
    name: "y",
    handles: ["n", "s"].map(type),
    input: function(y3, e) {
      return y3 == null ? null : [[e[0][0], +y3[0]], [e[1][0], +y3[1]]];
    },
    output: function(xy) {
      return xy && [xy[0][1], xy[1][1]];
    }
  };
  var XY = {
    name: "xy",
    handles: ["n", "w", "e", "s", "nw", "ne", "sw", "se"].map(type),
    input: function(xy) {
      return xy == null ? null : number2(xy);
    },
    output: function(xy) {
      return xy;
    }
  };
  function type(t) {
    return { type: t };
  }

  // node_modules/d3-force/src/center.js
  function center_default(x3, y3) {
    var nodes, strength = 1;
    if (x3 == null)
      x3 = 0;
    if (y3 == null)
      y3 = 0;
    function force() {
      var i, n = nodes.length, node, sx = 0, sy = 0;
      for (i = 0; i < n; ++i) {
        node = nodes[i], sx += node.x, sy += node.y;
      }
      for (sx = (sx / n - x3) * strength, sy = (sy / n - y3) * strength, i = 0; i < n; ++i) {
        node = nodes[i], node.x -= sx, node.y -= sy;
      }
    }
    force.initialize = function(_) {
      nodes = _;
    };
    force.x = function(_) {
      return arguments.length ? (x3 = +_, force) : x3;
    };
    force.y = function(_) {
      return arguments.length ? (y3 = +_, force) : y3;
    };
    force.strength = function(_) {
      return arguments.length ? (strength = +_, force) : strength;
    };
    return force;
  }

  // node_modules/d3-quadtree/src/add.js
  function add_default(d) {
    const x3 = +this._x.call(null, d), y3 = +this._y.call(null, d);
    return add(this.cover(x3, y3), x3, y3, d);
  }
  function add(tree, x3, y3, d) {
    if (isNaN(x3) || isNaN(y3))
      return tree;
    var parent, node = tree._root, leaf = { data: d }, x0 = tree._x0, y0 = tree._y0, x1 = tree._x1, y1 = tree._y1, xm, ym, xp, yp, right, bottom, i, j;
    if (!node)
      return tree._root = leaf, tree;
    while (node.length) {
      if (right = x3 >= (xm = (x0 + x1) / 2))
        x0 = xm;
      else
        x1 = xm;
      if (bottom = y3 >= (ym = (y0 + y1) / 2))
        y0 = ym;
      else
        y1 = ym;
      if (parent = node, !(node = node[i = bottom << 1 | right]))
        return parent[i] = leaf, tree;
    }
    xp = +tree._x.call(null, node.data);
    yp = +tree._y.call(null, node.data);
    if (x3 === xp && y3 === yp)
      return leaf.next = node, parent ? parent[i] = leaf : tree._root = leaf, tree;
    do {
      parent = parent ? parent[i] = new Array(4) : tree._root = new Array(4);
      if (right = x3 >= (xm = (x0 + x1) / 2))
        x0 = xm;
      else
        x1 = xm;
      if (bottom = y3 >= (ym = (y0 + y1) / 2))
        y0 = ym;
      else
        y1 = ym;
    } while ((i = bottom << 1 | right) === (j = (yp >= ym) << 1 | xp >= xm));
    return parent[j] = node, parent[i] = leaf, tree;
  }
  function addAll(data) {
    var d, i, n = data.length, x3, y3, xz = new Array(n), yz = new Array(n), x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (i = 0; i < n; ++i) {
      if (isNaN(x3 = +this._x.call(null, d = data[i])) || isNaN(y3 = +this._y.call(null, d)))
        continue;
      xz[i] = x3;
      yz[i] = y3;
      if (x3 < x0)
        x0 = x3;
      if (x3 > x1)
        x1 = x3;
      if (y3 < y0)
        y0 = y3;
      if (y3 > y1)
        y1 = y3;
    }
    if (x0 > x1 || y0 > y1)
      return this;
    this.cover(x0, y0).cover(x1, y1);
    for (i = 0; i < n; ++i) {
      add(this, xz[i], yz[i], data[i]);
    }
    return this;
  }

  // node_modules/d3-quadtree/src/cover.js
  function cover_default(x3, y3) {
    if (isNaN(x3 = +x3) || isNaN(y3 = +y3))
      return this;
    var x0 = this._x0, y0 = this._y0, x1 = this._x1, y1 = this._y1;
    if (isNaN(x0)) {
      x1 = (x0 = Math.floor(x3)) + 1;
      y1 = (y0 = Math.floor(y3)) + 1;
    } else {
      var z = x1 - x0 || 1, node = this._root, parent, i;
      while (x0 > x3 || x3 >= x1 || y0 > y3 || y3 >= y1) {
        i = (y3 < y0) << 1 | x3 < x0;
        parent = new Array(4), parent[i] = node, node = parent, z *= 2;
        switch (i) {
          case 0:
            x1 = x0 + z, y1 = y0 + z;
            break;
          case 1:
            x0 = x1 - z, y1 = y0 + z;
            break;
          case 2:
            x1 = x0 + z, y0 = y1 - z;
            break;
          case 3:
            x0 = x1 - z, y0 = y1 - z;
            break;
        }
      }
      if (this._root && this._root.length)
        this._root = node;
    }
    this._x0 = x0;
    this._y0 = y0;
    this._x1 = x1;
    this._y1 = y1;
    return this;
  }

  // node_modules/d3-quadtree/src/data.js
  function data_default2() {
    var data = [];
    this.visit(function(node) {
      if (!node.length)
        do
          data.push(node.data);
        while (node = node.next);
    });
    return data;
  }

  // node_modules/d3-quadtree/src/extent.js
  function extent_default(_) {
    return arguments.length ? this.cover(+_[0][0], +_[0][1]).cover(+_[1][0], +_[1][1]) : isNaN(this._x0) ? void 0 : [[this._x0, this._y0], [this._x1, this._y1]];
  }

  // node_modules/d3-quadtree/src/quad.js
  function quad_default(node, x0, y0, x1, y1) {
    this.node = node;
    this.x0 = x0;
    this.y0 = y0;
    this.x1 = x1;
    this.y1 = y1;
  }

  // node_modules/d3-quadtree/src/find.js
  function find_default(x3, y3, radius) {
    var data, x0 = this._x0, y0 = this._y0, x1, y1, x22, y22, x32 = this._x1, y32 = this._y1, quads = [], node = this._root, q, i;
    if (node)
      quads.push(new quad_default(node, x0, y0, x32, y32));
    if (radius == null)
      radius = Infinity;
    else {
      x0 = x3 - radius, y0 = y3 - radius;
      x32 = x3 + radius, y32 = y3 + radius;
      radius *= radius;
    }
    while (q = quads.pop()) {
      if (!(node = q.node) || (x1 = q.x0) > x32 || (y1 = q.y0) > y32 || (x22 = q.x1) < x0 || (y22 = q.y1) < y0)
        continue;
      if (node.length) {
        var xm = (x1 + x22) / 2, ym = (y1 + y22) / 2;
        quads.push(
          new quad_default(node[3], xm, ym, x22, y22),
          new quad_default(node[2], x1, ym, xm, y22),
          new quad_default(node[1], xm, y1, x22, ym),
          new quad_default(node[0], x1, y1, xm, ym)
        );
        if (i = (y3 >= ym) << 1 | x3 >= xm) {
          q = quads[quads.length - 1];
          quads[quads.length - 1] = quads[quads.length - 1 - i];
          quads[quads.length - 1 - i] = q;
        }
      } else {
        var dx = x3 - +this._x.call(null, node.data), dy = y3 - +this._y.call(null, node.data), d2 = dx * dx + dy * dy;
        if (d2 < radius) {
          var d = Math.sqrt(radius = d2);
          x0 = x3 - d, y0 = y3 - d;
          x32 = x3 + d, y32 = y3 + d;
          data = node.data;
        }
      }
    }
    return data;
  }

  // node_modules/d3-quadtree/src/remove.js
  function remove_default3(d) {
    if (isNaN(x3 = +this._x.call(null, d)) || isNaN(y3 = +this._y.call(null, d)))
      return this;
    var parent, node = this._root, retainer, previous, next, x0 = this._x0, y0 = this._y0, x1 = this._x1, y1 = this._y1, x3, y3, xm, ym, right, bottom, i, j;
    if (!node)
      return this;
    if (node.length)
      while (true) {
        if (right = x3 >= (xm = (x0 + x1) / 2))
          x0 = xm;
        else
          x1 = xm;
        if (bottom = y3 >= (ym = (y0 + y1) / 2))
          y0 = ym;
        else
          y1 = ym;
        if (!(parent = node, node = node[i = bottom << 1 | right]))
          return this;
        if (!node.length)
          break;
        if (parent[i + 1 & 3] || parent[i + 2 & 3] || parent[i + 3 & 3])
          retainer = parent, j = i;
      }
    while (node.data !== d)
      if (!(previous = node, node = node.next))
        return this;
    if (next = node.next)
      delete node.next;
    if (previous)
      return next ? previous.next = next : delete previous.next, this;
    if (!parent)
      return this._root = next, this;
    next ? parent[i] = next : delete parent[i];
    if ((node = parent[0] || parent[1] || parent[2] || parent[3]) && node === (parent[3] || parent[2] || parent[1] || parent[0]) && !node.length) {
      if (retainer)
        retainer[j] = node;
      else
        this._root = node;
    }
    return this;
  }
  function removeAll(data) {
    for (var i = 0, n = data.length; i < n; ++i)
      this.remove(data[i]);
    return this;
  }

  // node_modules/d3-quadtree/src/root.js
  function root_default() {
    return this._root;
  }

  // node_modules/d3-quadtree/src/size.js
  function size_default2() {
    var size = 0;
    this.visit(function(node) {
      if (!node.length)
        do
          ++size;
        while (node = node.next);
    });
    return size;
  }

  // node_modules/d3-quadtree/src/visit.js
  function visit_default(callback) {
    var quads = [], q, node = this._root, child, x0, y0, x1, y1;
    if (node)
      quads.push(new quad_default(node, this._x0, this._y0, this._x1, this._y1));
    while (q = quads.pop()) {
      if (!callback(node = q.node, x0 = q.x0, y0 = q.y0, x1 = q.x1, y1 = q.y1) && node.length) {
        var xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
        if (child = node[3])
          quads.push(new quad_default(child, xm, ym, x1, y1));
        if (child = node[2])
          quads.push(new quad_default(child, x0, ym, xm, y1));
        if (child = node[1])
          quads.push(new quad_default(child, xm, y0, x1, ym));
        if (child = node[0])
          quads.push(new quad_default(child, x0, y0, xm, ym));
      }
    }
    return this;
  }

  // node_modules/d3-quadtree/src/visitAfter.js
  function visitAfter_default(callback) {
    var quads = [], next = [], q;
    if (this._root)
      quads.push(new quad_default(this._root, this._x0, this._y0, this._x1, this._y1));
    while (q = quads.pop()) {
      var node = q.node;
      if (node.length) {
        var child, x0 = q.x0, y0 = q.y0, x1 = q.x1, y1 = q.y1, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
        if (child = node[0])
          quads.push(new quad_default(child, x0, y0, xm, ym));
        if (child = node[1])
          quads.push(new quad_default(child, xm, y0, x1, ym));
        if (child = node[2])
          quads.push(new quad_default(child, x0, ym, xm, y1));
        if (child = node[3])
          quads.push(new quad_default(child, xm, ym, x1, y1));
      }
      next.push(q);
    }
    while (q = next.pop()) {
      callback(q.node, q.x0, q.y0, q.x1, q.y1);
    }
    return this;
  }

  // node_modules/d3-quadtree/src/x.js
  function defaultX(d) {
    return d[0];
  }
  function x_default2(_) {
    return arguments.length ? (this._x = _, this) : this._x;
  }

  // node_modules/d3-quadtree/src/y.js
  function defaultY(d) {
    return d[1];
  }
  function y_default(_) {
    return arguments.length ? (this._y = _, this) : this._y;
  }

  // node_modules/d3-quadtree/src/quadtree.js
  function quadtree(nodes, x3, y3) {
    var tree = new Quadtree(x3 == null ? defaultX : x3, y3 == null ? defaultY : y3, NaN, NaN, NaN, NaN);
    return nodes == null ? tree : tree.addAll(nodes);
  }
  function Quadtree(x3, y3, x0, y0, x1, y1) {
    this._x = x3;
    this._y = y3;
    this._x0 = x0;
    this._y0 = y0;
    this._x1 = x1;
    this._y1 = y1;
    this._root = void 0;
  }
  function leaf_copy(leaf) {
    var copy = { data: leaf.data }, next = copy;
    while (leaf = leaf.next)
      next = next.next = { data: leaf.data };
    return copy;
  }
  var treeProto = quadtree.prototype = Quadtree.prototype;
  treeProto.copy = function() {
    var copy = new Quadtree(this._x, this._y, this._x0, this._y0, this._x1, this._y1), node = this._root, nodes, child;
    if (!node)
      return copy;
    if (!node.length)
      return copy._root = leaf_copy(node), copy;
    nodes = [{ source: node, target: copy._root = new Array(4) }];
    while (node = nodes.pop()) {
      for (var i = 0; i < 4; ++i) {
        if (child = node.source[i]) {
          if (child.length)
            nodes.push({ source: child, target: node.target[i] = new Array(4) });
          else
            node.target[i] = leaf_copy(child);
        }
      }
    }
    return copy;
  };
  treeProto.add = add_default;
  treeProto.addAll = addAll;
  treeProto.cover = cover_default;
  treeProto.data = data_default2;
  treeProto.extent = extent_default;
  treeProto.find = find_default;
  treeProto.remove = remove_default3;
  treeProto.removeAll = removeAll;
  treeProto.root = root_default;
  treeProto.size = size_default2;
  treeProto.visit = visit_default;
  treeProto.visitAfter = visitAfter_default;
  treeProto.x = x_default2;
  treeProto.y = y_default;

  // node_modules/d3-force/src/constant.js
  function constant_default5(x3) {
    return function() {
      return x3;
    };
  }

  // node_modules/d3-force/src/jiggle.js
  function jiggle_default(random) {
    return (random() - 0.5) * 1e-6;
  }

  // node_modules/d3-force/src/collide.js
  function x(d) {
    return d.x + d.vx;
  }
  function y(d) {
    return d.y + d.vy;
  }
  function collide_default(radius) {
    var nodes, radii, random, strength = 1, iterations = 1;
    if (typeof radius !== "function")
      radius = constant_default5(radius == null ? 1 : +radius);
    function force() {
      var i, n = nodes.length, tree, node, xi, yi, ri, ri2;
      for (var k = 0; k < iterations; ++k) {
        tree = quadtree(nodes, x, y).visitAfter(prepare);
        for (i = 0; i < n; ++i) {
          node = nodes[i];
          ri = radii[node.index], ri2 = ri * ri;
          xi = node.x + node.vx;
          yi = node.y + node.vy;
          tree.visit(apply);
        }
      }
      function apply(quad, x0, y0, x1, y1) {
        var data = quad.data, rj = quad.r, r = ri + rj;
        if (data) {
          if (data.index > node.index) {
            var x3 = xi - data.x - data.vx, y3 = yi - data.y - data.vy, l = x3 * x3 + y3 * y3;
            if (l < r * r) {
              if (x3 === 0)
                x3 = jiggle_default(random), l += x3 * x3;
              if (y3 === 0)
                y3 = jiggle_default(random), l += y3 * y3;
              l = (r - (l = Math.sqrt(l))) / l * strength;
              node.vx += (x3 *= l) * (r = (rj *= rj) / (ri2 + rj));
              node.vy += (y3 *= l) * r;
              data.vx -= x3 * (r = 1 - r);
              data.vy -= y3 * r;
            }
          }
          return;
        }
        return x0 > xi + r || x1 < xi - r || y0 > yi + r || y1 < yi - r;
      }
    }
    function prepare(quad) {
      if (quad.data)
        return quad.r = radii[quad.data.index];
      for (var i = quad.r = 0; i < 4; ++i) {
        if (quad[i] && quad[i].r > quad.r) {
          quad.r = quad[i].r;
        }
      }
    }
    function initialize() {
      if (!nodes)
        return;
      var i, n = nodes.length, node;
      radii = new Array(n);
      for (i = 0; i < n; ++i)
        node = nodes[i], radii[node.index] = +radius(node, i, nodes);
    }
    force.initialize = function(_nodes, _random) {
      nodes = _nodes;
      random = _random;
      initialize();
    };
    force.iterations = function(_) {
      return arguments.length ? (iterations = +_, force) : iterations;
    };
    force.strength = function(_) {
      return arguments.length ? (strength = +_, force) : strength;
    };
    force.radius = function(_) {
      return arguments.length ? (radius = typeof _ === "function" ? _ : constant_default5(+_), initialize(), force) : radius;
    };
    return force;
  }

  // node_modules/d3-force/src/link.js
  function index(d) {
    return d.index;
  }
  function find2(nodeById, nodeId) {
    var node = nodeById.get(nodeId);
    if (!node)
      throw new Error("node not found: " + nodeId);
    return node;
  }
  function link_default(links) {
    var id2 = index, strength = defaultStrength, strengths, distance = constant_default5(30), distances, nodes, count, bias, random, iterations = 1;
    if (links == null)
      links = [];
    function defaultStrength(link) {
      return 1 / Math.min(count[link.source.index], count[link.target.index]);
    }
    function force(alpha) {
      for (var k = 0, n = links.length; k < iterations; ++k) {
        for (var i = 0, link, source, target, x3, y3, l, b; i < n; ++i) {
          link = links[i], source = link.source, target = link.target;
          x3 = target.x + target.vx - source.x - source.vx || jiggle_default(random);
          y3 = target.y + target.vy - source.y - source.vy || jiggle_default(random);
          l = Math.sqrt(x3 * x3 + y3 * y3);
          l = (l - distances[i]) / l * alpha * strengths[i];
          x3 *= l, y3 *= l;
          target.vx -= x3 * (b = bias[i]);
          target.vy -= y3 * b;
          source.vx += x3 * (b = 1 - b);
          source.vy += y3 * b;
        }
      }
    }
    function initialize() {
      if (!nodes)
        return;
      var i, n = nodes.length, m2 = links.length, nodeById = new Map(nodes.map((d, i2) => [id2(d, i2, nodes), d])), link;
      for (i = 0, count = new Array(n); i < m2; ++i) {
        link = links[i], link.index = i;
        if (typeof link.source !== "object")
          link.source = find2(nodeById, link.source);
        if (typeof link.target !== "object")
          link.target = find2(nodeById, link.target);
        count[link.source.index] = (count[link.source.index] || 0) + 1;
        count[link.target.index] = (count[link.target.index] || 0) + 1;
      }
      for (i = 0, bias = new Array(m2); i < m2; ++i) {
        link = links[i], bias[i] = count[link.source.index] / (count[link.source.index] + count[link.target.index]);
      }
      strengths = new Array(m2), initializeStrength();
      distances = new Array(m2), initializeDistance();
    }
    function initializeStrength() {
      if (!nodes)
        return;
      for (var i = 0, n = links.length; i < n; ++i) {
        strengths[i] = +strength(links[i], i, links);
      }
    }
    function initializeDistance() {
      if (!nodes)
        return;
      for (var i = 0, n = links.length; i < n; ++i) {
        distances[i] = +distance(links[i], i, links);
      }
    }
    force.initialize = function(_nodes, _random) {
      nodes = _nodes;
      random = _random;
      initialize();
    };
    force.links = function(_) {
      return arguments.length ? (links = _, initialize(), force) : links;
    };
    force.id = function(_) {
      return arguments.length ? (id2 = _, force) : id2;
    };
    force.iterations = function(_) {
      return arguments.length ? (iterations = +_, force) : iterations;
    };
    force.strength = function(_) {
      return arguments.length ? (strength = typeof _ === "function" ? _ : constant_default5(+_), initializeStrength(), force) : strength;
    };
    force.distance = function(_) {
      return arguments.length ? (distance = typeof _ === "function" ? _ : constant_default5(+_), initializeDistance(), force) : distance;
    };
    return force;
  }

  // node_modules/d3-force/src/lcg.js
  var a = 1664525;
  var c = 1013904223;
  var m = 4294967296;
  function lcg_default() {
    let s = 1;
    return () => (s = (a * s + c) % m) / m;
  }

  // node_modules/d3-force/src/simulation.js
  function x2(d) {
    return d.x;
  }
  function y2(d) {
    return d.y;
  }
  var initialRadius = 10;
  var initialAngle = Math.PI * (3 - Math.sqrt(5));
  function simulation_default(nodes) {
    var simulation, alpha = 1, alphaMin = 1e-3, alphaDecay = 1 - Math.pow(alphaMin, 1 / 300), alphaTarget = 0, velocityDecay = 0.6, forces = /* @__PURE__ */ new Map(), stepper = timer(step), event = dispatch_default("tick", "end"), random = lcg_default();
    if (nodes == null)
      nodes = [];
    function step() {
      tick2();
      event.call("tick", simulation);
      if (alpha < alphaMin) {
        stepper.stop();
        event.call("end", simulation);
      }
    }
    function tick2(iterations) {
      var i, n = nodes.length, node;
      if (iterations === void 0)
        iterations = 1;
      for (var k = 0; k < iterations; ++k) {
        alpha += (alphaTarget - alpha) * alphaDecay;
        forces.forEach(function(force) {
          force(alpha);
        });
        for (i = 0; i < n; ++i) {
          node = nodes[i];
          if (node.fx == null)
            node.x += node.vx *= velocityDecay;
          else
            node.x = node.fx, node.vx = 0;
          if (node.fy == null)
            node.y += node.vy *= velocityDecay;
          else
            node.y = node.fy, node.vy = 0;
        }
      }
      return simulation;
    }
    function initializeNodes() {
      for (var i = 0, n = nodes.length, node; i < n; ++i) {
        node = nodes[i], node.index = i;
        if (node.fx != null)
          node.x = node.fx;
        if (node.fy != null)
          node.y = node.fy;
        if (isNaN(node.x) || isNaN(node.y)) {
          var radius = initialRadius * Math.sqrt(0.5 + i), angle = i * initialAngle;
          node.x = radius * Math.cos(angle);
          node.y = radius * Math.sin(angle);
        }
        if (isNaN(node.vx) || isNaN(node.vy)) {
          node.vx = node.vy = 0;
        }
      }
    }
    function initializeForce(force) {
      if (force.initialize)
        force.initialize(nodes, random);
      return force;
    }
    initializeNodes();
    return simulation = {
      tick: tick2,
      restart: function() {
        return stepper.restart(step), simulation;
      },
      stop: function() {
        return stepper.stop(), simulation;
      },
      nodes: function(_) {
        return arguments.length ? (nodes = _, initializeNodes(), forces.forEach(initializeForce), simulation) : nodes;
      },
      alpha: function(_) {
        return arguments.length ? (alpha = +_, simulation) : alpha;
      },
      alphaMin: function(_) {
        return arguments.length ? (alphaMin = +_, simulation) : alphaMin;
      },
      alphaDecay: function(_) {
        return arguments.length ? (alphaDecay = +_, simulation) : +alphaDecay;
      },
      alphaTarget: function(_) {
        return arguments.length ? (alphaTarget = +_, simulation) : alphaTarget;
      },
      velocityDecay: function(_) {
        return arguments.length ? (velocityDecay = 1 - _, simulation) : 1 - velocityDecay;
      },
      randomSource: function(_) {
        return arguments.length ? (random = _, forces.forEach(initializeForce), simulation) : random;
      },
      force: function(name, _) {
        return arguments.length > 1 ? (_ == null ? forces.delete(name) : forces.set(name, initializeForce(_)), simulation) : forces.get(name);
      },
      find: function(x3, y3, radius) {
        var i = 0, n = nodes.length, dx, dy, d2, node, closest;
        if (radius == null)
          radius = Infinity;
        else
          radius *= radius;
        for (i = 0; i < n; ++i) {
          node = nodes[i];
          dx = x3 - node.x;
          dy = y3 - node.y;
          d2 = dx * dx + dy * dy;
          if (d2 < radius)
            closest = node, radius = d2;
        }
        return closest;
      },
      on: function(name, _) {
        return arguments.length > 1 ? (event.on(name, _), simulation) : event.on(name);
      }
    };
  }

  // node_modules/d3-force/src/manyBody.js
  function manyBody_default() {
    var nodes, node, random, alpha, strength = constant_default5(-30), strengths, distanceMin2 = 1, distanceMax2 = Infinity, theta2 = 0.81;
    function force(_) {
      var i, n = nodes.length, tree = quadtree(nodes, x2, y2).visitAfter(accumulate);
      for (alpha = _, i = 0; i < n; ++i)
        node = nodes[i], tree.visit(apply);
    }
    function initialize() {
      if (!nodes)
        return;
      var i, n = nodes.length, node2;
      strengths = new Array(n);
      for (i = 0; i < n; ++i)
        node2 = nodes[i], strengths[node2.index] = +strength(node2, i, nodes);
    }
    function accumulate(quad) {
      var strength2 = 0, q, c2, weight = 0, x3, y3, i;
      if (quad.length) {
        for (x3 = y3 = i = 0; i < 4; ++i) {
          if ((q = quad[i]) && (c2 = Math.abs(q.value))) {
            strength2 += q.value, weight += c2, x3 += c2 * q.x, y3 += c2 * q.y;
          }
        }
        quad.x = x3 / weight;
        quad.y = y3 / weight;
      } else {
        q = quad;
        q.x = q.data.x;
        q.y = q.data.y;
        do
          strength2 += strengths[q.data.index];
        while (q = q.next);
      }
      quad.value = strength2;
    }
    function apply(quad, x1, _, x22) {
      if (!quad.value)
        return true;
      var x3 = quad.x - node.x, y3 = quad.y - node.y, w = x22 - x1, l = x3 * x3 + y3 * y3;
      if (w * w / theta2 < l) {
        if (l < distanceMax2) {
          if (x3 === 0)
            x3 = jiggle_default(random), l += x3 * x3;
          if (y3 === 0)
            y3 = jiggle_default(random), l += y3 * y3;
          if (l < distanceMin2)
            l = Math.sqrt(distanceMin2 * l);
          node.vx += x3 * quad.value * alpha / l;
          node.vy += y3 * quad.value * alpha / l;
        }
        return true;
      } else if (quad.length || l >= distanceMax2)
        return;
      if (quad.data !== node || quad.next) {
        if (x3 === 0)
          x3 = jiggle_default(random), l += x3 * x3;
        if (y3 === 0)
          y3 = jiggle_default(random), l += y3 * y3;
        if (l < distanceMin2)
          l = Math.sqrt(distanceMin2 * l);
      }
      do
        if (quad.data !== node) {
          w = strengths[quad.data.index] * alpha / l;
          node.vx += x3 * w;
          node.vy += y3 * w;
        }
      while (quad = quad.next);
    }
    force.initialize = function(_nodes, _random) {
      nodes = _nodes;
      random = _random;
      initialize();
    };
    force.strength = function(_) {
      return arguments.length ? (strength = typeof _ === "function" ? _ : constant_default5(+_), initialize(), force) : strength;
    };
    force.distanceMin = function(_) {
      return arguments.length ? (distanceMin2 = _ * _, force) : Math.sqrt(distanceMin2);
    };
    force.distanceMax = function(_) {
      return arguments.length ? (distanceMax2 = _ * _, force) : Math.sqrt(distanceMax2);
    };
    force.theta = function(_) {
      return arguments.length ? (theta2 = _ * _, force) : Math.sqrt(theta2);
    };
    return force;
  }

  // node_modules/d3-zoom/src/constant.js
  var constant_default6 = (x3) => () => x3;

  // node_modules/d3-zoom/src/event.js
  function ZoomEvent(type2, {
    sourceEvent,
    target,
    transform: transform2,
    dispatch: dispatch2
  }) {
    Object.defineProperties(this, {
      type: { value: type2, enumerable: true, configurable: true },
      sourceEvent: { value: sourceEvent, enumerable: true, configurable: true },
      target: { value: target, enumerable: true, configurable: true },
      transform: { value: transform2, enumerable: true, configurable: true },
      _: { value: dispatch2 }
    });
  }

  // node_modules/d3-zoom/src/transform.js
  function Transform(k, x3, y3) {
    this.k = k;
    this.x = x3;
    this.y = y3;
  }
  Transform.prototype = {
    constructor: Transform,
    scale: function(k) {
      return k === 1 ? this : new Transform(this.k * k, this.x, this.y);
    },
    translate: function(x3, y3) {
      return x3 === 0 & y3 === 0 ? this : new Transform(this.k, this.x + this.k * x3, this.y + this.k * y3);
    },
    apply: function(point) {
      return [point[0] * this.k + this.x, point[1] * this.k + this.y];
    },
    applyX: function(x3) {
      return x3 * this.k + this.x;
    },
    applyY: function(y3) {
      return y3 * this.k + this.y;
    },
    invert: function(location) {
      return [(location[0] - this.x) / this.k, (location[1] - this.y) / this.k];
    },
    invertX: function(x3) {
      return (x3 - this.x) / this.k;
    },
    invertY: function(y3) {
      return (y3 - this.y) / this.k;
    },
    rescaleX: function(x3) {
      return x3.copy().domain(x3.range().map(this.invertX, this).map(x3.invert, x3));
    },
    rescaleY: function(y3) {
      return y3.copy().domain(y3.range().map(this.invertY, this).map(y3.invert, y3));
    },
    toString: function() {
      return "translate(" + this.x + "," + this.y + ") scale(" + this.k + ")";
    }
  };
  var identity3 = new Transform(1, 0, 0);
  transform.prototype = Transform.prototype;
  function transform(node) {
    while (!node.__zoom)
      if (!(node = node.parentNode))
        return identity3;
    return node.__zoom;
  }

  // node_modules/d3-zoom/src/noevent.js
  function nopropagation3(event) {
    event.stopImmediatePropagation();
  }
  function noevent_default3(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  // node_modules/d3-zoom/src/zoom.js
  function defaultFilter2(event) {
    return (!event.ctrlKey || event.type === "wheel") && !event.button;
  }
  function defaultExtent() {
    var e = this;
    if (e instanceof SVGElement) {
      e = e.ownerSVGElement || e;
      if (e.hasAttribute("viewBox")) {
        e = e.viewBox.baseVal;
        return [[e.x, e.y], [e.x + e.width, e.y + e.height]];
      }
      return [[0, 0], [e.width.baseVal.value, e.height.baseVal.value]];
    }
    return [[0, 0], [e.clientWidth, e.clientHeight]];
  }
  function defaultTransform() {
    return this.__zoom || identity3;
  }
  function defaultWheelDelta(event) {
    return -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 2e-3) * (event.ctrlKey ? 10 : 1);
  }
  function defaultTouchable2() {
    return navigator.maxTouchPoints || "ontouchstart" in this;
  }
  function defaultConstrain(transform2, extent, translateExtent) {
    var dx0 = transform2.invertX(extent[0][0]) - translateExtent[0][0], dx1 = transform2.invertX(extent[1][0]) - translateExtent[1][0], dy0 = transform2.invertY(extent[0][1]) - translateExtent[0][1], dy1 = transform2.invertY(extent[1][1]) - translateExtent[1][1];
    return transform2.translate(
      dx1 > dx0 ? (dx0 + dx1) / 2 : Math.min(0, dx0) || Math.max(0, dx1),
      dy1 > dy0 ? (dy0 + dy1) / 2 : Math.min(0, dy0) || Math.max(0, dy1)
    );
  }
  function zoom_default2() {
    var filter2 = defaultFilter2, extent = defaultExtent, constrain = defaultConstrain, wheelDelta = defaultWheelDelta, touchable = defaultTouchable2, scaleExtent = [0, Infinity], translateExtent = [[-Infinity, -Infinity], [Infinity, Infinity]], duration = 250, interpolate = zoom_default, listeners = dispatch_default("start", "zoom", "end"), touchstarting, touchfirst, touchending, touchDelay = 500, wheelDelay = 150, clickDistance2 = 0, tapDistance = 10;
    function zoom(selection2) {
      selection2.property("__zoom", defaultTransform).on("wheel.zoom", wheeled, { passive: false }).on("mousedown.zoom", mousedowned).on("dblclick.zoom", dblclicked).filter(touchable).on("touchstart.zoom", touchstarted).on("touchmove.zoom", touchmoved).on("touchend.zoom touchcancel.zoom", touchended).style("-webkit-tap-highlight-color", "rgba(0,0,0,0)");
    }
    zoom.transform = function(collection, transform2, point, event) {
      var selection2 = collection.selection ? collection.selection() : collection;
      selection2.property("__zoom", defaultTransform);
      if (collection !== selection2) {
        schedule(collection, transform2, point, event);
      } else {
        selection2.interrupt().each(function() {
          gesture(this, arguments).event(event).start().zoom(null, typeof transform2 === "function" ? transform2.apply(this, arguments) : transform2).end();
        });
      }
    };
    zoom.scaleBy = function(selection2, k, p, event) {
      zoom.scaleTo(selection2, function() {
        var k0 = this.__zoom.k, k1 = typeof k === "function" ? k.apply(this, arguments) : k;
        return k0 * k1;
      }, p, event);
    };
    zoom.scaleTo = function(selection2, k, p, event) {
      zoom.transform(selection2, function() {
        var e = extent.apply(this, arguments), t0 = this.__zoom, p0 = p == null ? centroid(e) : typeof p === "function" ? p.apply(this, arguments) : p, p1 = t0.invert(p0), k1 = typeof k === "function" ? k.apply(this, arguments) : k;
        return constrain(translate(scale(t0, k1), p0, p1), e, translateExtent);
      }, p, event);
    };
    zoom.translateBy = function(selection2, x3, y3, event) {
      zoom.transform(selection2, function() {
        return constrain(this.__zoom.translate(
          typeof x3 === "function" ? x3.apply(this, arguments) : x3,
          typeof y3 === "function" ? y3.apply(this, arguments) : y3
        ), extent.apply(this, arguments), translateExtent);
      }, null, event);
    };
    zoom.translateTo = function(selection2, x3, y3, p, event) {
      zoom.transform(selection2, function() {
        var e = extent.apply(this, arguments), t = this.__zoom, p0 = p == null ? centroid(e) : typeof p === "function" ? p.apply(this, arguments) : p;
        return constrain(identity3.translate(p0[0], p0[1]).scale(t.k).translate(
          typeof x3 === "function" ? -x3.apply(this, arguments) : -x3,
          typeof y3 === "function" ? -y3.apply(this, arguments) : -y3
        ), e, translateExtent);
      }, p, event);
    };
    function scale(transform2, k) {
      k = Math.max(scaleExtent[0], Math.min(scaleExtent[1], k));
      return k === transform2.k ? transform2 : new Transform(k, transform2.x, transform2.y);
    }
    function translate(transform2, p0, p1) {
      var x3 = p0[0] - p1[0] * transform2.k, y3 = p0[1] - p1[1] * transform2.k;
      return x3 === transform2.x && y3 === transform2.y ? transform2 : new Transform(transform2.k, x3, y3);
    }
    function centroid(extent2) {
      return [(+extent2[0][0] + +extent2[1][0]) / 2, (+extent2[0][1] + +extent2[1][1]) / 2];
    }
    function schedule(transition2, transform2, point, event) {
      transition2.on("start.zoom", function() {
        gesture(this, arguments).event(event).start();
      }).on("interrupt.zoom end.zoom", function() {
        gesture(this, arguments).event(event).end();
      }).tween("zoom", function() {
        var that = this, args = arguments, g = gesture(that, args).event(event), e = extent.apply(that, args), p = point == null ? centroid(e) : typeof point === "function" ? point.apply(that, args) : point, w = Math.max(e[1][0] - e[0][0], e[1][1] - e[0][1]), a2 = that.__zoom, b = typeof transform2 === "function" ? transform2.apply(that, args) : transform2, i = interpolate(a2.invert(p).concat(w / a2.k), b.invert(p).concat(w / b.k));
        return function(t) {
          if (t === 1)
            t = b;
          else {
            var l = i(t), k = w / l[2];
            t = new Transform(k, p[0] - l[0] * k, p[1] - l[1] * k);
          }
          g.zoom(null, t);
        };
      });
    }
    function gesture(that, args, clean) {
      return !clean && that.__zooming || new Gesture(that, args);
    }
    function Gesture(that, args) {
      this.that = that;
      this.args = args;
      this.active = 0;
      this.sourceEvent = null;
      this.extent = extent.apply(that, args);
      this.taps = 0;
    }
    Gesture.prototype = {
      event: function(event) {
        if (event)
          this.sourceEvent = event;
        return this;
      },
      start: function() {
        if (++this.active === 1) {
          this.that.__zooming = this;
          this.emit("start");
        }
        return this;
      },
      zoom: function(key, transform2) {
        if (this.mouse && key !== "mouse")
          this.mouse[1] = transform2.invert(this.mouse[0]);
        if (this.touch0 && key !== "touch")
          this.touch0[1] = transform2.invert(this.touch0[0]);
        if (this.touch1 && key !== "touch")
          this.touch1[1] = transform2.invert(this.touch1[0]);
        this.that.__zoom = transform2;
        this.emit("zoom");
        return this;
      },
      end: function() {
        if (--this.active === 0) {
          delete this.that.__zooming;
          this.emit("end");
        }
        return this;
      },
      emit: function(type2) {
        var d = select_default2(this.that).datum();
        listeners.call(
          type2,
          this.that,
          new ZoomEvent(type2, {
            sourceEvent: this.sourceEvent,
            target: zoom,
            type: type2,
            transform: this.that.__zoom,
            dispatch: listeners
          }),
          d
        );
      }
    };
    function wheeled(event, ...args) {
      if (!filter2.apply(this, arguments))
        return;
      var g = gesture(this, args).event(event), t = this.__zoom, k = Math.max(scaleExtent[0], Math.min(scaleExtent[1], t.k * Math.pow(2, wheelDelta.apply(this, arguments)))), p = pointer_default(event);
      if (g.wheel) {
        if (g.mouse[0][0] !== p[0] || g.mouse[0][1] !== p[1]) {
          g.mouse[1] = t.invert(g.mouse[0] = p);
        }
        clearTimeout(g.wheel);
      } else if (t.k === k)
        return;
      else {
        g.mouse = [p, t.invert(p)];
        interrupt_default(this);
        g.start();
      }
      noevent_default3(event);
      g.wheel = setTimeout(wheelidled, wheelDelay);
      g.zoom("mouse", constrain(translate(scale(t, k), g.mouse[0], g.mouse[1]), g.extent, translateExtent));
      function wheelidled() {
        g.wheel = null;
        g.end();
      }
    }
    function mousedowned(event, ...args) {
      if (touchending || !filter2.apply(this, arguments))
        return;
      var currentTarget = event.currentTarget, g = gesture(this, args, true).event(event), v = select_default2(event.view).on("mousemove.zoom", mousemoved, true).on("mouseup.zoom", mouseupped, true), p = pointer_default(event, currentTarget), x0 = event.clientX, y0 = event.clientY;
      nodrag_default(event.view);
      nopropagation3(event);
      g.mouse = [p, this.__zoom.invert(p)];
      interrupt_default(this);
      g.start();
      function mousemoved(event2) {
        noevent_default3(event2);
        if (!g.moved) {
          var dx = event2.clientX - x0, dy = event2.clientY - y0;
          g.moved = dx * dx + dy * dy > clickDistance2;
        }
        g.event(event2).zoom("mouse", constrain(translate(g.that.__zoom, g.mouse[0] = pointer_default(event2, currentTarget), g.mouse[1]), g.extent, translateExtent));
      }
      function mouseupped(event2) {
        v.on("mousemove.zoom mouseup.zoom", null);
        yesdrag(event2.view, g.moved);
        noevent_default3(event2);
        g.event(event2).end();
      }
    }
    function dblclicked(event, ...args) {
      if (!filter2.apply(this, arguments))
        return;
      var t0 = this.__zoom, p0 = pointer_default(event.changedTouches ? event.changedTouches[0] : event, this), p1 = t0.invert(p0), k1 = t0.k * (event.shiftKey ? 0.5 : 2), t1 = constrain(translate(scale(t0, k1), p0, p1), extent.apply(this, args), translateExtent);
      noevent_default3(event);
      if (duration > 0)
        select_default2(this).transition().duration(duration).call(schedule, t1, p0, event);
      else
        select_default2(this).call(zoom.transform, t1, p0, event);
    }
    function touchstarted(event, ...args) {
      if (!filter2.apply(this, arguments))
        return;
      var touches = event.touches, n = touches.length, g = gesture(this, args, event.changedTouches.length === n).event(event), started, i, t, p;
      nopropagation3(event);
      for (i = 0; i < n; ++i) {
        t = touches[i], p = pointer_default(t, this);
        p = [p, this.__zoom.invert(p), t.identifier];
        if (!g.touch0)
          g.touch0 = p, started = true, g.taps = 1 + !!touchstarting;
        else if (!g.touch1 && g.touch0[2] !== p[2])
          g.touch1 = p, g.taps = 0;
      }
      if (touchstarting)
        touchstarting = clearTimeout(touchstarting);
      if (started) {
        if (g.taps < 2)
          touchfirst = p[0], touchstarting = setTimeout(function() {
            touchstarting = null;
          }, touchDelay);
        interrupt_default(this);
        g.start();
      }
    }
    function touchmoved(event, ...args) {
      if (!this.__zooming)
        return;
      var g = gesture(this, args).event(event), touches = event.changedTouches, n = touches.length, i, t, p, l;
      noevent_default3(event);
      for (i = 0; i < n; ++i) {
        t = touches[i], p = pointer_default(t, this);
        if (g.touch0 && g.touch0[2] === t.identifier)
          g.touch0[0] = p;
        else if (g.touch1 && g.touch1[2] === t.identifier)
          g.touch1[0] = p;
      }
      t = g.that.__zoom;
      if (g.touch1) {
        var p0 = g.touch0[0], l0 = g.touch0[1], p1 = g.touch1[0], l1 = g.touch1[1], dp = (dp = p1[0] - p0[0]) * dp + (dp = p1[1] - p0[1]) * dp, dl = (dl = l1[0] - l0[0]) * dl + (dl = l1[1] - l0[1]) * dl;
        t = scale(t, Math.sqrt(dp / dl));
        p = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
        l = [(l0[0] + l1[0]) / 2, (l0[1] + l1[1]) / 2];
      } else if (g.touch0)
        p = g.touch0[0], l = g.touch0[1];
      else
        return;
      g.zoom("touch", constrain(translate(t, p, l), g.extent, translateExtent));
    }
    function touchended(event, ...args) {
      if (!this.__zooming)
        return;
      var g = gesture(this, args).event(event), touches = event.changedTouches, n = touches.length, i, t;
      nopropagation3(event);
      if (touchending)
        clearTimeout(touchending);
      touchending = setTimeout(function() {
        touchending = null;
      }, touchDelay);
      for (i = 0; i < n; ++i) {
        t = touches[i];
        if (g.touch0 && g.touch0[2] === t.identifier)
          delete g.touch0;
        else if (g.touch1 && g.touch1[2] === t.identifier)
          delete g.touch1;
      }
      if (g.touch1 && !g.touch0)
        g.touch0 = g.touch1, delete g.touch1;
      if (g.touch0)
        g.touch0[1] = this.__zoom.invert(g.touch0[0]);
      else {
        g.end();
        if (g.taps === 2) {
          t = pointer_default(t, this);
          if (Math.hypot(touchfirst[0] - t[0], touchfirst[1] - t[1]) < tapDistance) {
            var p = select_default2(this).on("dblclick.zoom");
            if (p)
              p.apply(this, arguments);
          }
        }
      }
    }
    zoom.wheelDelta = function(_) {
      return arguments.length ? (wheelDelta = typeof _ === "function" ? _ : constant_default6(+_), zoom) : wheelDelta;
    };
    zoom.filter = function(_) {
      return arguments.length ? (filter2 = typeof _ === "function" ? _ : constant_default6(!!_), zoom) : filter2;
    };
    zoom.touchable = function(_) {
      return arguments.length ? (touchable = typeof _ === "function" ? _ : constant_default6(!!_), zoom) : touchable;
    };
    zoom.extent = function(_) {
      return arguments.length ? (extent = typeof _ === "function" ? _ : constant_default6([[+_[0][0], +_[0][1]], [+_[1][0], +_[1][1]]]), zoom) : extent;
    };
    zoom.scaleExtent = function(_) {
      return arguments.length ? (scaleExtent[0] = +_[0], scaleExtent[1] = +_[1], zoom) : [scaleExtent[0], scaleExtent[1]];
    };
    zoom.translateExtent = function(_) {
      return arguments.length ? (translateExtent[0][0] = +_[0][0], translateExtent[1][0] = +_[1][0], translateExtent[0][1] = +_[0][1], translateExtent[1][1] = +_[1][1], zoom) : [[translateExtent[0][0], translateExtent[0][1]], [translateExtent[1][0], translateExtent[1][1]]];
    };
    zoom.constrain = function(_) {
      return arguments.length ? (constrain = _, zoom) : constrain;
    };
    zoom.duration = function(_) {
      return arguments.length ? (duration = +_, zoom) : duration;
    };
    zoom.interpolate = function(_) {
      return arguments.length ? (interpolate = _, zoom) : interpolate;
    };
    zoom.on = function() {
      var value = listeners.on.apply(listeners, arguments);
      return value === listeners ? zoom : value;
    };
    zoom.clickDistance = function(_) {
      return arguments.length ? (clickDistance2 = (_ = +_) * _, zoom) : Math.sqrt(clickDistance2);
    };
    zoom.tapDistance = function(_) {
      return arguments.length ? (tapDistance = +_, zoom) : tapDistance;
    };
    return zoom;
  }

  // packages/ui/src/views/agent/GraphPane.svelte
  function add_css22(target) {
    append_styles(target, "svelte-wunf0q", ".agent-graph-pane{border:1px solid var(--background-modifier-border);border-radius:6px;overflow:hidden;background:var(--background-primary);width:100%;height:100%}");
  }
  function create_fragment48(ctx) {
    let div;
    return {
      c() {
        div = element("div");
        div.innerHTML = ``;
        attr(div, "class", "agent-graph-pane");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        ctx[3](div);
      },
      p: noop,
      i: noop,
      o: noop,
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        ctx[3](null);
      }
    };
  }
  function nodeLabel(n) {
    return n.name || n.key || "?";
  }
  function instance48($$self, $$props, $$invalidate) {
    let { nodes = [] } = $$props;
    let { edges = [] } = $$props;
    let container;
    let sim;
    const COLORS = {
      material: "#4c9aff",
      process: "#52c41a",
      equipment: "#fa8c16",
      experiment: "#eb2f96",
      property: "#722ed1",
      team: "#13c2c2",
      topic: "#8c8c8c",
      default: "#bfbfbf"
    };
    const LABEL_TO_TYPE2 = {
      Material: "material",
      Process: "process",
      Equipment: "equipment",
      Experiment: "experiment",
      Parameter: "property",
      Expert: "team",
      Claim: "topic",
      Facility: "equipment",
      Document: "topic",
      Chunk: "topic"
    };
    function nodeColor(n) {
      const type2 = LABEL_TO_TYPE2[n.label] || "default";
      return COLORS[type2];
    }
    function draw() {
      if (!container || nodes.length === 0)
        return;
      if (sim) {
        sim.stop();
        sim = null;
      }
      $$invalidate(0, container.innerHTML = "", container);
      const rect = container.getBoundingClientRect();
      const WIDTH = rect.width || 720;
      const HEIGHT = rect.height || 420;
      const svg = select_default2(container).append("svg").attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`).style("width", "100%").style("height", "100%").style("display", "block").style("background", "var(--background-primary)");
      const g = svg.append("g");
      const zoom = zoom_default2().scaleExtent([0.2, 4]).on("zoom", (ev) => g.attr("transform", ev.transform));
      svg.call(zoom);
      const nodeMap = /* @__PURE__ */ new Map();
      for (const n of nodes)
        nodeMap.set(n.key || n.name, n);
      const linkData = edges.filter((e) => nodeMap.has(e.from) && nodeMap.has(e.to)).map((e) => ({
        source: e.from,
        target: e.to,
        type: e.type || ""
      }));
      const nodeData = nodes.map((n) => ({
        id: n.key || n.name,
        name: nodeLabel(n),
        label: n.label || "?",
        color: nodeColor(n)
      }));
      sim = simulation_default(nodeData).force("link", link_default(linkData).id((d) => d.id).distance(130)).force("charge", manyBody_default().strength(-350)).force("center", center_default(WIDTH / 2, HEIGHT / 2)).force("collide", collide_default(45));
      const link = g.append("g").selectAll("line").data(linkData).join("line").attr("stroke", "#555").attr("stroke-width", 1.5).attr("stroke-opacity", 0.5);
      const linkLabel = g.append("g").selectAll("text").data(linkData).join("text").text((d) => d.type).attr("font-size", "7px").attr("fill", "#999").attr("text-anchor", "middle").attr("dy", -4);
      const node = g.append("g").selectAll("g").data(nodeData).join("g").call(drag_default().on("start", (ev, d) => {
        if (!ev.active)
          sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }).on("drag", (ev, d) => {
        d.fx = ev.x;
        d.fy = ev.y;
      }).on("end", (ev, d) => {
        if (!ev.active)
          sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }));
      node.append("circle").attr("r", 12).attr("fill", (d) => d.color).attr("stroke", "var(--background-primary)").attr("stroke-width", 2);
      node.append("text").text((d) => d.name.length > 22 ? d.name.slice(0, 22) + "\u2026" : d.name).attr("font-size", "8px").attr("fill", "var(--text-normal)").attr("text-anchor", "middle").attr("dy", 24);
      node.append("title").text((d) => `${d.label}: ${d.name}`);
      sim.on("tick", () => {
        link.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y).attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
        linkLabel.attr("x", (d) => (d.source.x + d.target.x) / 2).attr("y", (d) => (d.source.y + d.target.y) / 2);
        node.attr("transform", (d) => `translate(${d.x},${d.y})`);
      });
    }
    onMount(draw);
    onDestroy(() => {
      if (sim) {
        sim.stop();
        sim = null;
      }
    });
    function div_binding($$value) {
      binding_callbacks[$$value ? "unshift" : "push"](() => {
        container = $$value;
        $$invalidate(0, container);
      });
    }
    $$self.$$set = ($$props2) => {
      if ("nodes" in $$props2)
        $$invalidate(1, nodes = $$props2.nodes);
      if ("edges" in $$props2)
        $$invalidate(2, edges = $$props2.edges);
    };
    $$self.$$.update = () => {
      if ($$self.$$.dirty & /*nodes, edges*/
      6) {
        $:
          if (nodes.length > 0) {
            nodes;
            edges;
            draw();
          }
      }
    };
    return [container, nodes, edges, div_binding];
  }
  var GraphPane = class extends SvelteComponent {
    constructor(options) {
      super();
      init(this, options, instance48, create_fragment48, safe_not_equal, { nodes: 1, edges: 2 }, add_css22);
    }
  };
  var GraphPane_default = GraphPane;

  // packages/ui/src/views/agent/loading-presets.js
  var LOADER = `<span class="agent-loading-dot"></span><span class="agent-loading-dot"></span><span class="agent-loading-dot"></span>`;
  var LOADING_THINKING = `<div class="agent-chat-loading">${LOADER} Thinking...</div>`;
  var LOADING_SEARCH = `<div class="agent-chat-loading">${LOADER} Searching knowledge graph...</div>`;
  var LOADING_ANALYZE = `<div class="agent-chat-loading">${LOADER} Analyzing query...</div>`;
  var LOADING_GENERATE = `<div class="agent-chat-loading">${LOADER} Generating response...</div>`;
  var LOADING_FETCH = `<div class="agent-chat-loading">${LOADER} Fetching documents...</div>`;
  function loadingWithText(text2) {
    return `<div class="agent-chat-loading">${LOADER} ${text2}</div>`;
  }
  return __toCommonJS(src_exports2);
})();
/*! Bundled license information:

lucide-svelte/dist/defaultAttributes.js:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   * 
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   * 
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   * 
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   * 
   * ---
   * 
   * The MIT License (MIT) (for portions derived from Feather)
   * 
   * Copyright (c) 2013-2026 Cole Bemis
   * 
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   * 
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   * 
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   * 
   *)

lucide-svelte/dist/utils/hasA11yProp.js:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   * 
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   * 
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   * 
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   * 
   * ---
   * 
   * The MIT License (MIT) (for portions derived from Feather)
   * 
   * Copyright (c) 2013-2026 Cole Bemis
   * 
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   * 
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   * 
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   * 
   *)

lucide-svelte/dist/utils/mergeClasses.js:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   * 
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   * 
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   * 
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   * 
   * ---
   * 
   * The MIT License (MIT) (for portions derived from Feather)
   * 
   * Copyright (c) 2013-2026 Cole Bemis
   * 
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   * 
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   * 
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   * 
   *)

lucide-svelte/dist/icons/check.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/circle-alert.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/ellipsis-vertical.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/eye.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/folder-key.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/folder-plus.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/folder.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/list-checks.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/pen-line.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/pen.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/pencil.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/plus.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/ribbon.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/search.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/settings.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/shield.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/square-menu.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/square-pen.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/square-plus.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/trash-2.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/trash.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/user-plus.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/users.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/vault.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/x.svelte:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   *)

lucide-svelte/dist/icons/index.js:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   * 
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   * 
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   * 
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   * 
   * ---
   * 
   * The MIT License (MIT) (for portions derived from Feather)
   * 
   * Copyright (c) 2013-2026 Cole Bemis
   * 
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   * 
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   * 
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   * 
   *)

lucide-svelte/dist/icons/menu-square.js:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   * 
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   * 
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   * 
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   * 
   * ---
   * 
   * The MIT License (MIT) (for portions derived from Feather)
   * 
   * Copyright (c) 2013-2026 Cole Bemis
   * 
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   * 
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   * 
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   * 
   *)

lucide-svelte/dist/icons/pen-square.js:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   * 
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   * 
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   * 
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   * 
   * ---
   * 
   * The MIT License (MIT) (for portions derived from Feather)
   * 
   * Copyright (c) 2013-2026 Cole Bemis
   * 
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   * 
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   * 
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   * 
   *)

lucide-svelte/dist/aliases/aliases.js:
  (**
   * @license lucide-svelte v0.577.0 - ISC
   *
   * ISC License
   * 
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   * 
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   * 
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   * 
   * ---
   * 
   * The MIT License (MIT) (for portions derived from Feather)
   * 
   * Copyright (c) 2013-2026 Cole Bemis
   * 
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   * 
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   * 
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   * 
   *)
*/
