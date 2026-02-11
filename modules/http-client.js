(function initPoeHttpModule(global) {
  'use strict';

  function createHttpClient({ fetchImpl = global.fetch.bind(global) } = {}) {
    async function getJson(url, options = {}) {
      const response = await fetchImpl(url, options);
      if (!response.ok) {
        const error = new Error(String(response.status));
        error.status = response.status;
        error.url = url;
        error.response = response;
        throw error;
      }
      const data = await response.json();
      return { data, response };
    }

    return Object.freeze({
      getJson
    });
  }

  global.PoeHttp = Object.freeze({
    createHttpClient
  });
})(window);
