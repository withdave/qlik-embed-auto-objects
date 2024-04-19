async function getAccessToken() {
  const response = await fetch("/access-token", {
    method: "POST",
    credentials: "include",
    mode: "same-origin",
    redirect: "follow",
  });
  if (response.status === 200) {
    return response.text();
  }
  const err = new Error("Unexpected serverside authentication error");
  err.status = response.status;
  err.detail;
  throw err;
}
async function getSheets() {
  const response = await fetch("/assets", {
    method: "GET",
    credentials: "include",
    mode: "same-origin",
    redirect: "follow",
  });
  if (response.status === 200) {
    return response.json();
  }
  const err = new Error("Unexpected error");
  err.status = response.status;
  err.detail;
  throw err;
}
async function getConfig() {
  const response = await fetch("/config", {
    method: "GET",
    credentials: "include",
    mode: "same-origin",
    redirect: "follow",
  });
  if (response.status === 200) {
    return response.json();
  }
  const err = new Error("Unexpected error");
  err.status = response.status;
  err.detail;
  throw err;
}
