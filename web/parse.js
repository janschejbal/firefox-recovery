'use strict';

let vueData = {
  'raw': null,
  'showraw': false,
  'd': null,
  'favicons': false,
  'ready': false
}

let LZ4Module;

function init() {
  new Vue({el: '#renderarea', data: vueData});
  LZ4().then((module) => {
    LZ4Module = module;
    vueData.ready = true;
    loadFile(true);
  });
}

function msg(m) {
  console.log(m);
  alert(m);
}

function loadFile(silent) {
  let files = document.getElementById('file-selector').files;
  let file = files && files.length && files[0];
  if (!file) {
    if (!silent) {
      msg('no file selected');
    }
    return;
  }

  vueData.d = vueData.raw = null;

  promiseFileContents(file)
    .then(checkFileSize)
    .then(decompress)
    .then(decode)
    .then(parseAndShow)
    .then(null, msg);
}

function promiseFileContents(file) {
  let reader = new FileReader();
  let readerPromise = new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
  });
  reader.readAsArrayBuffer(file);
  return readerPromise;
}

function checkFileSize(data) {
  if (data.byteLength == 0) {
    throw "File is empty.";
  }

  let mb = Math.round(data.byteLength / 1000000);
  if (mb > 5 && !confirm("That's a big file! (" + mb + " MB). It will take a while and may crash your browser. Continue?")) {
    throw "Aborted.";
  }
  return data;
}

function decompress(data) {
  // Mozilla LZ4 format seems to be:
  //   - magic "mozLz40\0"
  //   - uint32 size
  //   - compressed data

  const MOZ_LZ4_MAGIC = [109, 111, 122, 76, 122, 52, 48, 0];
  const api = {
    create_buffer: LZ4Module.cwrap('create_buffer', 'number', ['number']),
    destroy_buffer: LZ4Module.cwrap('destroy_buffer', '', ['number']),
    decompress: LZ4Module.cwrap('decompress', 'number', ['number', 'number', 'number', 'number']),
  };

  if (data.byteLength < 12) {
    throw "File is too short; cannot decode.";
  }

  let magic = new Uint8Array(data.slice(0,8));
  let out_length = new Uint32Array(data.slice(8,12))[0];
  let body = new Uint8Array(data.slice(12));

  if (magic[0] == 0x7b) {
    console.log("File is not compressed; starts with '{' so we'll try to parse it as uncompressed JSON.");
    return data;
  }
  
  for (let i=0; i<8; i++) {
    if (magic[i] != MOZ_LZ4_MAGIC[i]) {
      throw "File does not look like a valid Mozilla LZ4 compressed file (nor like a plain JSON object).";
    }
  }
  
  let input = api.create_buffer(body.length);
  let output = api.create_buffer(out_length);
  LZ4Module.HEAPU8.set(body, input);
  let result = api.decompress(input, body.length, output, out_length);
  
  api.destroy_buffer(input);

  if (result < 0) {
    api.destroy_buffer(output);
    throw "File failed to decompress, LZ4 returned error code " + result;
  }

  if (result != out_length) {
    msg("Decompressed file is shorter than expected, got " + result + " out of " + out_length + " expected bytes. It is likely that a part of the file is missing and parsing will fail. You can inspect the decompressed data using the raw section and try to fix truncated JSON with 'Guess missing end'.");
  }

  const outputView = new Uint8Array(LZ4Module.HEAPU8.buffer, output, result);
  const outputCopy = new Uint8Array(outputView);

  api.destroy_buffer(output); 
  return outputCopy;
}

function decode(data) {
  vueData.raw = new TextDecoder('utf-8').decode(data);
  return vueData.raw;
}

function parseAndShow(data) {
  let parsed = JSON.parse(data);
  if (!parsed.version || parsed.version.length != 2 || parsed.version[0] != "sessionrestore" || parsed.version[1] != 1) {
    msg("Version tag not found or unexpected value: I'm not sure if this file is a session restore file that I can understand. I'll try my best. Expected [\"sessionrestore\",1], got: " + JSON.stringify(parsed.version));
  }
  vueData.d = parsed;
}

Vue.component('tab', {
  props: ['t', 'favicons'],
  data: function () {
    return this.t.___DISPLAYSTATE = this.t.___DISPLAYSTATE || {
      showhistory: false,
      showsession: false,
    };
  },
  template: `
<div class="tab" v-if="t.index && t.entries && t.entries.length >= t.index">
  <span class="historyindicator" v-on:click.prevent="showhistory = !showhistory">
    <span :class="'back' + (t.index > 1 ? '' : ' nohistory')">{{t.index-1}} ◀ </span>
    <span :class="'forward' + (t.index < t.entries.length ? '' : ' nohistory')"> ▶ {{t.entries.length - t.index}}</span>
  </span>
  <img v-if="favicons" :src="t.image" class="favicon"> <a :href="t.entries[t.index-1].url">{{t.entries[t.index-1].title}}</a>
  <ul class="history" v-if="showhistory">
    <li :class="(t.index-1) == i ? 'currententry' : ''" v-for="(e, i) in t.entries">
      <a :href="e.url">{{e.title}}</a>
    </li>
  </ul>
  <div class="sessionrestore expando" v-on:click.self.prevent="showsession = !showsession" v-if="t.formdata && t.formdata.id && t.formdata.id.sessionData && (t.formdata.url == 'about:sessionrestore' || t.entries[t.index-1].url == 'about:sessionrestore')">
    {{ showsession ? '[−]' : '[+]'}} Session restore information
    <session v-if="showsession" v-bind:favicons="favicons" :d="t.formdata.id.sessionData"></session>
  </div>
</div>
`
});

Vue.component('window', {
  props: ['w', 'closed', 'favicons'],
  data: function () {
    return this.w.___DISPLAYSTATE = this.w.___DISPLAYSTATE || {
      expanded: !this.closed,
      showclosedtabs: false,
    };
  },
  template: `
<div :class="'window expando' + (closed ? ' closed' : '')" v-on:click.self.prevent="expanded = !expanded">
  {{ expanded ? '[−]' : '[+]'}}
  {{ closed ? 'Closed window' : 'Window'}} ({{w.tabs && w.tabs.length}} tabs, {{w._closedTabs && w._closedTabs.length}} closed tabs)
  <div v-if="expanded">
    <tab :t="t" v-bind:favicons="favicons" v-for="t in w.tabs"></tab>
    <div class="closedtabs expando" v-on:click.self.prevent="showclosedtabs = !showclosedtabs">
      {{showclosedtabs ? '[−]' : '[+]'}}
      {{w._closedTabs && w._closedTabs.length}} closed tabs
      <tab v-if="showclosedtabs" :t="t.state" v-bind:favicons="favicons" v-for="t in w._closedTabs"></tab>
    </div>
  </div>
</div>
`
})

Vue.component('session', {
  props: ['d', 'favicons'],
  template: `
<div v-if="d">
  <window :w="w" v-bind:favicons="favicons" v-for="w in d.windows"></window>
  <window :w="w" v-bind:favicons="favicons" closed="closed" v-for="w in d._closedWindows"></window>
</div>
`
})


// Utils for the "raw data" section

function jsonParse() {
  vueData.d = null;
  try {
    parseAndShow(vueData.raw)
  } catch(e) {
    msg(e);
  }
}

function jsonGuess() {
  let data = vueData.raw;
  if (!data) return;

  if (data.charCodeAt(data.length-1) == 65533) { // trim "replacement character" if present
    data = data.slice(0, -1);
  }
  let stack = [];
  for (let i = 0; i < data.length; i++) {
    let c = data.charAt(i);
    if (stack.length && stack[stack.length-1] == '"') { // inside a string
      if (c == '\\') { // skip escape character
        i++;
      } else if (c == '"') { // end of string
        stack.pop();
      }
    } else {
      switch (c) {
        case '{':
          stack.push('}');
          break;
        case '[':
          stack.push(']');
          break;
        case '"':
          stack.push('"');
          break;
        case '}':
        case ']':
          if (c != stack.pop()) {
            msg("Unbalanced brackets/braces, cannot propose suffix.");
            return;
          }
      }
    }
  }
  if (stack.length) {
    let suffix = stack.reverse().join("");
    vueData.raw += suffix;
    msg("Appended propsed suffix: " + suffix + " (this only handles quotes and brackets/braces; you may still need to fix partial object items etc.)")
  } else {
    msg("No missing suffix found");
  }
}

function jsonPretty() {
  try {
    vueData.raw = JSON.stringify(JSON.parse(vueData.raw), null, 2);
  } catch(e) {
    msg(e)
  }
}