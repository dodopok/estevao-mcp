import type { ConsentContext } from "./provider.js";

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
}

const FIREBASE_SDK_VERSION = "11.0.2";

/**
 * The sign-in + consent screen. Plain server-rendered HTML: the Firebase Web SDK
 * runs in the user's browser, and only the resulting ID token reaches this server.
 */
export function renderConsentPage(options: {
  requestId: string;
  context: ConsentContext;
  firebase: FirebaseWebConfig;
  portalUrl: string;
}): string {
  const { requestId, context, firebase, portalUrl } = options;
  const config = JSON.stringify({
    apiKey: firebase.apiKey,
    authDomain: firebase.authDomain,
    projectId: firebase.projectId,
  });

  return layout(
    "Conectar ao Estêvão",
    `
    <main class="card">
      <p class="eyebrow">Estêvão · API litúrgica</p>
      <h1>Conectar <strong>${escapeHtml(context.clientName)}</strong></h1>
      <p class="lede">
        ${escapeHtml(context.clientName)} quer acessar o calendário litúrgico, o lecionário e o
        Ofício Diário em seu nome. Entre com a mesma conta do portal de desenvolvedores.
      </p>

      <ul class="scopes">
        <li><span aria-hidden="true">✓</span> Ler calendário, leituras, coletas e ofícios</li>
        <li><span aria-hidden="true">✓</span> Somente leitura — nada é alterado na sua conta</li>
        <li><span aria-hidden="true">✓</span> Você pode revogar quando quiser no portal</li>
      </ul>

      <p class="redirect">Depois de aprovar, você volta para <code>${escapeHtml(context.redirectHost)}</code>.</p>

      <div id="error" class="error" hidden></div>

      <section id="signin">
        <button id="google" class="primary" type="button">Entrar com Google</button>
        <p class="divider"><span>ou com e-mail</span></p>
        <form id="email-form" autocomplete="on">
          <label>E-mail<input id="email" type="email" required autocomplete="username" /></label>
          <label>Senha<input id="password" type="password" required minlength="6" autocomplete="current-password" /></label>
          <button class="secondary" type="submit">Entrar</button>
        </form>
      </section>

      <section id="approve" hidden>
        <p class="signed-in">Conectado como <strong id="who"></strong>.</p>
        <button id="allow" class="primary" type="button">Permitir acesso</button>
        <button id="deny" class="ghost" type="button">Cancelar</button>
      </section>

      <p class="foot">
        Precisa gerenciar suas chaves? <a href="${escapeHtml(portalUrl)}/dashboard/keys">Portal do desenvolvedor</a>
      </p>
    </main>

    <script type="module">
      import { initializeApp } from "https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js";
      import {
        getAuth, GoogleAuthProvider, signInWithPopup,
        signInWithEmailAndPassword, createUserWithEmailAndPassword
      } from "https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js";

      const REQUEST_ID = ${JSON.stringify(requestId)};
      const auth = getAuth(initializeApp(${config}));
      const el = (id) => document.getElementById(id);
      let idToken = null;

      const fail = (message) => {
        const box = el("error");
        box.textContent = message;
        box.hidden = false;
      };

      const signedIn = async (user) => {
        idToken = await user.getIdToken();
        el("who").textContent = user.email || user.displayName || "sua conta";
        el("signin").hidden = true;
        el("approve").hidden = false;
        el("error").hidden = true;
      };

      el("google").addEventListener("click", async () => {
        try {
          const result = await signInWithPopup(auth, new GoogleAuthProvider());
          await signedIn(result.user);
        } catch (err) {
          fail("Não foi possível entrar com o Google. Tente novamente.");
        }
      });

      el("email-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const email = el("email").value;
        const password = el("password").value;
        try {
          let credential;
          try {
            credential = await signInWithEmailAndPassword(auth, email, password);
          } catch (err) {
            if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
              credential = await createUserWithEmailAndPassword(auth, email, password);
            } else {
              throw err;
            }
          }
          await signedIn(credential.user);
        } catch (err) {
          fail("E-mail ou senha inválidos.");
        }
      });

      el("allow").addEventListener("click", async () => {
        el("allow").disabled = true;
        try {
          const response = await fetch("/oauth/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ request: REQUEST_ID, id_token: idToken }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.message || "Não foi possível concluir a conexão.");
          window.location.assign(body.redirect_to);
        } catch (err) {
          el("allow").disabled = false;
          fail(err.message);
        }
      });

      el("deny").addEventListener("click", async () => {
        const response = await fetch("/oauth/deny", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request: REQUEST_ID }),
        });
        const body = await response.json().catch(() => ({}));
        if (body.redirect_to) window.location.assign(body.redirect_to);
        else window.close();
      });
    </script>
  `,
  );
}

export function renderMessagePage(title: string, message: string): string {
  return layout(
    title,
    `<main class="card">
       <p class="eyebrow">Estêvão · API litúrgica</p>
       <h1>${escapeHtml(title)}</h1>
       <p class="lede">${escapeHtml(message)}</p>
     </main>`,
  );
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
<style>
  :root {
    --ink: #12212b; --deep: #00416A; --muted: #5b6b76;
    --paper: #fbf9f5; --line: #e6ded0; --danger: #8c2f2f;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 2rem 1rem;
    background: radial-gradient(circle at 50% 0%, #ffffff 0%, var(--paper) 55%);
    color: var(--ink); font-family: Inter, system-ui, sans-serif; font-weight: 300;
  }
  .card {
    width: min(30rem, 100%); background: #fff; border: 1px solid var(--line);
    border-radius: 14px; padding: 2.25rem; box-shadow: 0 18px 45px -30px rgba(0, 65, 106, .45);
  }
  .eyebrow { margin: 0 0 .75rem; font-size: .72rem; letter-spacing: .18em; text-transform: uppercase; color: var(--deep); }
  h1 { margin: 0 0 .75rem; font-family: "Cormorant Garamond", Georgia, serif; font-size: 1.9rem; font-weight: 600; line-height: 1.2; }
  h1 strong { color: var(--deep); font-weight: 600; }
  .lede { margin: 0 0 1.25rem; color: var(--muted); line-height: 1.6; font-size: .95rem; }
  .scopes { list-style: none; margin: 0 0 1.25rem; padding: 0; display: grid; gap: .5rem; font-size: .9rem; }
  .scopes li { display: flex; gap: .6rem; align-items: flex-start; }
  .scopes span { color: var(--deep); }
  .redirect { margin: 0 0 1.5rem; font-size: .82rem; color: var(--muted); }
  code { background: var(--paper); padding: .1rem .35rem; border-radius: 4px; font-size: .82rem; }
  button { width: 100%; border-radius: 9px; padding: .8rem 1rem; font: inherit; font-weight: 500; cursor: pointer; border: 1px solid transparent; }
  .primary { background: var(--deep); color: #fff; }
  .primary:hover { background: #003454; }
  .primary:disabled { opacity: .6; cursor: progress; }
  .secondary { background: #fff; border-color: var(--line); color: var(--ink); }
  .ghost { background: none; color: var(--muted); margin-top: .5rem; }
  form { display: grid; gap: .75rem; }
  label { display: grid; gap: .3rem; font-size: .82rem; color: var(--muted); }
  input { padding: .65rem .75rem; border: 1px solid var(--line); border-radius: 8px; font: inherit; color: var(--ink); }
  input:focus-visible { outline: 2px solid var(--deep); outline-offset: 1px; }
  .divider { display: flex; align-items: center; gap: .75rem; color: var(--muted); font-size: .75rem; margin: 1.25rem 0; }
  .divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: var(--line); }
  .error { background: #fdf1f1; border: 1px solid #f0d5d5; color: var(--danger); padding: .7rem .85rem; border-radius: 8px; font-size: .85rem; margin-bottom: 1rem; }
  .signed-in { font-size: .9rem; color: var(--muted); margin: 0 0 1rem; }
  .foot { margin: 1.75rem 0 0; padding-top: 1.25rem; border-top: 1px solid var(--line); font-size: .8rem; color: var(--muted); }
  a { color: var(--deep); }
  @media (prefers-color-scheme: dark) {
    :root { --ink: #eef2f4; --paper: #0d1418; --line: #24333c; --muted: #9fb0ba; --deep: #7fb3d5; }
    body { background: #0a1115; }
    .card { background: #101a20; }
    .primary { background: var(--deep); color: #06222f; }
    .primary:hover { background: #a2cbe4; }
    .secondary, input { background: #0d161b; color: var(--ink); }
    .error { background: #2a1618; border-color: #4a2427; color: #f0b4b4; }
  }
</style>
</head>
<body>${body}</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
