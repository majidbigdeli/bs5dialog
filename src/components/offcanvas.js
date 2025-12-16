import {
  makeRequest,
  isUrlOrPath,
  genDialogId,
  replayLock,
  triggerEvent,
  observeElement
} from "../utils.js";

import * as i18n from "../i18n.js";
import bs5Offcanvas from "bootstrap/js/dist/offcanvas.js";
import { makeIcon } from "../resource/icons";
import { message } from "./message";

export async function offcanvas(content, options = {}) {
  const defaultOptions = {
    title: "",
    type: "danger",

    direction: "end",
    size: "",
    id: "",

    backdrop: true,
    scroll: true,
    dark: false,

    maximize: false,

    btnOkText: "",
    btnCancelText: "",

    onShow: null,
    onShown: null,
    onHide: null,
    onHidden: null,
    onCancel: null,

    isForm: true,
    onSubmit: null,
    onSubmitSuccess: r => {},
    onSubmitError: r => {},
    onSubmitDone: r => {}
  };

  options = { ...defaultOptions, ...options };

  // ---------- resolve/create element (اما با "fresh replace" برای جلوگیری از خراب شدن)
  let el;
  const existing = options.id ? document.getElementById(options.id) : null;

  if (existing) {
    // اگر قبلاً instance داشته، dispose
    const old = bs5Offcanvas.getInstance(existing);
    if (old) old.dispose();

    // جایگزینی با یک element تازه تا همه listenerهای قبلی پاک شوند
    el = existing.cloneNode(false);
    el.setAttribute("id", options.id);
    existing.replaceWith(el);
  } else {
    el = document.createElement("div");
    options.id = options.id || genDialogId();
    el.setAttribute("id", options.id);
  }

  // ---------- load url like modal
  if (isUrlOrPath(content)) {
    const apiUrl = content;
    const res = await makeRequest(apiUrl, "GET");
    content = res.content;

    if (typeof content === "string" && (content.includes("<!DOCTYPE html>") || content.includes("<html"))) {
      content = `<iframe src="${apiUrl}" width="100%" height="100%" style="border:0"></iframe>`;
      options.scroll = false;
    }
  }

  // ---------- lifecycle (like load)
  observeElement(el, {
    created: () => {
      options.onShow?.(el);
      triggerEvent(el, "bs5:dialog:load:created", { options, el });
    },
    rendered: () => {
      options.onShown?.(el);
      triggerEvent(el, "bs5:dialog:load:rendered", { options, el });
    },
    hidden: () => {
      options.onHidden?.(el);
      triggerEvent(el, "bs5:dialog:load:hidden", { options, el });
    }
  });

  // ---------- offcanvas setup (UNCHANGED behavior)
  el.className = "";
  el.classList.add("offcanvas", "bs5dialog-offcanvas", "offcanvas-" + options.direction);
  el.setAttribute("tabindex", "-1");
  el.setAttribute("role", "dialog");

  if (options.scroll) el.setAttribute("data-bs-scroll", "true");
  else el.removeAttribute("data-bs-scroll");

  el.setAttribute("data-bs-backdrop", options.backdrop);

  if (options.direction === "start" || options.direction === "end") {
    el.style.width = options.size || "";
    el.style.height = "";
  }
  if (options.direction === "top" || options.direction === "bottom") {
    el.style.height = options.size || "";
    el.style.width = "";
  }

  // ---------- template
  el.innerHTML = `
    <div class="offcanvas-header">
      <h5 class="offcanvas-title">${options.title || ""}</h5>
      <div class="offcanvas-maximize-toggle ms-auto me-2"></div>
      <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
    </div>

    <div class="offcanvas-body">
      ${content}
    </div>

    <div class="offcanvas-footer d-none p-3 border-top d-flex gap-2">
      <button type="button" class="btn btn-cancel me-auto">
        ${options.btnCancelText || i18n.getConfig("cancel")}
      </button>
      <button type="button" class="btn btn-ok btn-${options.type}">
        ${options.btnOkText || i18n.getConfig("save")}
      </button>
    </div>
  `;

  if (options.dark) {
    el.classList.add("text-bg-dark");
    el.querySelector(".btn-close")?.classList.add("btn-close-white");
  }

  // ---------- maximize icons
  const iconMin = makeIcon("bs5-minimize", "btn-minimize d-none", "cursor:pointer");
  const iconMax = makeIcon("bs5-maximize", "btn-maximize", "cursor:pointer");

  const toggle = el.querySelector(".offcanvas-maximize-toggle");
  toggle.append(iconMin, iconMax);

  // اگر element تازه ساخته شده و در DOM نیست، اضافه‌اش کن
  if (!el.isConnected) document.body.appendChild(el);

  // instance مثل کد اصلی
  const modalInstance = bs5Offcanvas.getOrCreateInstance(el);

  // ---------- onHide (مثل load)
  el.addEventListener("hide.bs.offcanvas", () => {
    options.onHide?.(el);
  });

  // ---------- maximize/fullscreen + برگشت (بدون تغییر transform)
  const prevSize = { width: el.style.width || "", height: el.style.height || "" };

  const doMaximize = () => {
    prevSize.width = el.style.width || "";
    prevSize.height = el.style.height || "";

    el.style.width = "100vw";
    el.style.height = "100vh";

    iconMax.classList.add("d-none");
    iconMin.classList.remove("d-none");

    triggerEvent(el, "bs5:dialog:load:maximize", { options });
  };

  const doMinimize = () => {
    el.style.width = prevSize.width;
    el.style.height = prevSize.height;

    // اگر جهت افقی است، height را به حالت offcanvas معمول برگردان
    if (options.direction === "start" || options.direction === "end") {
      // معمولاً height باید خالی باشد
      if (!prevSize.height) el.style.height = "";
    }
    // اگر جهت عمودی است، width را به حالت offcanvas معمول برگردان
    if (options.direction === "top" || options.direction === "bottom") {
      if (!prevSize.width) el.style.width = "";
    }

    iconMin.classList.add("d-none");
    iconMax.classList.remove("d-none");

    triggerEvent(el, "bs5:dialog:load:minimize", { options });
  };

  // فقط وقتی واقعاً باز است اجازه maximize بده (برای اینکه رفتار انیمیشن offcanvas تغییر نکند)
  const runWhenShown = fn => {
    if (el.classList.contains("show")) return fn();
    el.addEventListener("shown.bs.offcanvas", fn, { once: true });
  };

  iconMax.onclick = () => runWhenShown(doMaximize);
  iconMin.onclick = () => runWhenShown(doMinimize);

  // اگر از ابتدا maximize خواسته شده، بعد از باز شدن اعمال کن
  if (options.maximize) {
    runWhenShown(doMaximize);
  }

  // ---------- cancel
  const cancelBtn = el.querySelector(".btn-cancel");
  cancelBtn?.addEventListener("click", () => {
    replayLock(cancelBtn);
    triggerEvent(el, "bs5:dialog:load:cancel", { options });
    options.onCancel?.();
    modalInstance.hide();
  });

  // ---------- form submit like load (کامل)
  const form = el.querySelector("form");
  if (options.isForm && form) {
    const footer = el.querySelector(".offcanvas-footer");
    const okBtn = el.querySelector(".btn-ok");
    const submitBtn = form.querySelector('button[type="submit"]');

    footer?.classList.remove("d-none");

    if (submitBtn) {
      submitBtn.style.display = "none";
      okBtn.textContent = submitBtn.textContent || okBtn.textContent;
    }

    form.addEventListener("submit", e => e.preventDefault());

    okBtn.onclick = async e => {
      e?.preventDefault?.();
      replayLock(okBtn);

      triggerEvent(el, "bs5:dialog:form:submit", {
        options,
        formEl: form,
        formAction: form.action,
        formMethod: form.method,
        formData: new FormData(form)
      });

      if (typeof options.onSubmit === "function") {
        options.onSubmit(el);
      }

      const res = await makeRequest(form.action, form.method, {}, new FormData(form));

      triggerEvent(el, "bs5:dialog:form:submit:complete", {
        options,
        formEl: form,
        formAction: form.action,
        formMethod: form.method,
        formData: new FormData(form),
        submitResult: res
      });

      options.onSubmitDone?.(res);

      if (res.isSuccess) {
        triggerEvent(el, "bs5:dialog:form:submit:success", {
          options,
          formEl: form,
          submitResult: res
        });

        options.onSubmitSuccess?.(res);
        modalInstance.hide();
      } else {
        triggerEvent(el, "bs5:dialog:form:submit:error", {
          options,
          formEl: form,
          submitResult: res
        });

        options.onSubmitError?.(res);
        message(res.content);
      }
    };
  }

  // ---------- show (EXACTLY like original)
  modalInstance.toggle();

  return { el, content, options, modalInstance };
}
