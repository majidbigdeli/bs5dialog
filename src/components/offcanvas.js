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

// --- sizeClassName -> px (برای offcanvas باید اندازه واقعی بدیم)
function resolveOffcanvasSize(options) {
  // اگر size مستقیم داده شده، همونو استفاده کن
  if (options.size && String(options.size).trim()) return options.size;

  // اگر sizeClassName داده شده
  const cls = (options.sizeClassName || "").toLowerCase();

  // این map رو اگر لازم داری مطابق UI خودت تغییر بده
  const map = {
    sm: "420px",
    md: "600px",
    lg: "900px",
    xl: "1200px"
  };

  return map[cls] || ""; // اگر خالی برگرده، Bootstrap/default CSS تصمیم می‌گیره
}

export async function offcanvas(content, options = {}) {
  const defaultOptions = {
    title: "",
    type: "danger",

    direction: "end",
    size: "",
    sizeClassName: "xl", // ✅ اضافه شد
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

  // ✅ اندازه نهایی بر اساس sizeClassName
  const resolvedSize = resolveOffcanvasSize(options);

  // ---------- resolve/create element (fresh replace)
  let el;
  const existing = options.id ? document.getElementById(options.id) : null;

  if (existing) {
    const old = bs5Offcanvas.getInstance(existing);
    if (old) old.dispose();

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
    content = `<iframe src="${apiUrl}" width="100%" height="100%" style="border:0;display:block;"></iframe>`;
    options.scroll = false; // body پشت offcanvas اسکرول نخوره
  }

  // ---------- lifecycle
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

  // ---------- offcanvas setup
  el.className = "";
  el.classList.add("offcanvas", "bs5dialog-offcanvas", "offcanvas-" + options.direction);
  el.setAttribute("tabindex", "-1");
  el.setAttribute("role", "dialog");

  if (options.scroll) el.setAttribute("data-bs-scroll", "true");
  else el.setAttribute("data-bs-scroll", "false");

  el.setAttribute("data-bs-backdrop", options.backdrop ? "true" : "false");

  // ✅ اینجا به جای options.size از resolvedSize استفاده می‌کنیم
  if (options.direction === "start" || options.direction === "end") {
    el.style.width = resolvedSize || "";
    el.style.height = "";
  }
  if (options.direction === "top" || options.direction === "bottom") {
    el.style.height = resolvedSize || "";
    el.style.width = "";
  }

  // ---------- template
el.innerHTML = `
  <div class="offcanvas-header">
    <h5 class="offcanvas-title mb-0">${options.title || ""}</h5>

    <div class="offcanvas-actions d-flex align-items-center gap-2">
      <div class="offcanvas-maximize-toggle"></div>
      <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
    </div>
  </div>

  <div class="offcanvas-body">
    ${content}
  </div>
`;


  if (options.dark) {
    el.classList.add("text-bg-dark");
    el.querySelector(".btn-close")?.classList.add("btn-close-white");
  }

  const body = el.querySelector(".offcanvas-body");

  // ✅ برای iframe فول‌سایز، offcanvas رو flex کن تا height=100% واقعی بشه
  // (این باعث میشه height=100% iframe درست کار کنه)
  el.style.display = "flex";
  el.style.flexDirection = "column";
  body.style.flex = "1 1 auto";
  body.style.minHeight = "0";

  if (!options.scroll) {
    body.style.overflow = "hidden";
    body.style.padding = "0";
  } else {
    body.style.overflow = "auto";
  }

  // ---------- maximize icons
  const iconMin = makeIcon("bs5-minimize", "btn-minimize d-none", "cursor:pointer");
  const iconMax = makeIcon("bs5-maximize", "btn-maximize", "cursor:pointer");

  const toggle = el.querySelector(".offcanvas-maximize-toggle");
  toggle.append(iconMin, iconMax);

  if (!el.isConnected) document.body.appendChild(el);

  const modalInstance = bs5Offcanvas.getOrCreateInstance(el);

  // ---------- onHide
  el.addEventListener("hide.bs.offcanvas", () => {
    options.onHide?.(el);
  });

  // ---------- maximize/fullscreen + restore
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
    // ✅ برگشت به resolvedSize (نه فقط prevSize)
    if (options.direction === "start" || options.direction === "end") {
      el.style.width = prevSize.width || resolvedSize || "";
      el.style.height = "";
    } else {
      el.style.height = prevSize.height || resolvedSize || "";
      el.style.width = "";
    }

    iconMin.classList.add("d-none");
    iconMax.classList.remove("d-none");

    triggerEvent(el, "bs5:dialog:load:minimize", { options });
  };

  const runWhenShown = fn => {
    if (el.classList.contains("show")) return fn();
    el.addEventListener("shown.bs.offcanvas", fn, { once: true });
  };

  iconMax.onclick = () => runWhenShown(doMaximize);
  iconMin.onclick = () => runWhenShown(doMinimize);

  if (options.maximize) runWhenShown(doMaximize);

  // ---------- cancel (تو template فعلاً btn-cancel نداری؛ اگر اضافه کنی کار می‌کند)
  const cancelBtn = el.querySelector(".btn-cancel");
  cancelBtn?.addEventListener("click", () => {
    replayLock(cancelBtn);
    triggerEvent(el, "bs5:dialog:load:cancel", { options });
    options.onCancel?.();
    modalInstance.hide();
  });

  // ---------- form submit (تو template فعلاً footer/btn-ok نداری؛ اگر اضافه کنی کار می‌کند)
  const form = el.querySelector("form");
  if (options.isForm && form) {
    const footer = el.querySelector(".offcanvas-footer");
    const okBtn = el.querySelector(".btn-ok");
    const submitBtn = form.querySelector('button[type="submit"]');

    footer?.classList.remove("d-none");

    if (submitBtn && okBtn) {
      submitBtn.style.display = "none";
      okBtn.textContent = submitBtn.textContent || okBtn.textContent;
    }

    form.addEventListener("submit", e => e.preventDefault());

    if (okBtn) {
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

        options.onSubmit?.(el);

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
          triggerEvent(el, "bs5:dialog:form:submit:success", { options, formEl: form, submitResult: res });
          options.onSubmitSuccess?.(res);
          modalInstance.hide();
        } else {
          triggerEvent(el, "bs5:dialog:form:submit:error", { options, formEl: form, submitResult: res });
          options.onSubmitError?.(res);
          message(res.content);
        }
      };
    }
  }

  // ---------- show
  modalInstance.toggle();

  return { el, content, options, modalInstance };
}
