// Wrapper to make LZ4 usable from WebASM.
// Compiling may require a newer emscripten than your distro provides!

// Compile with:
// emcc -o ../web/lz4.js -O3 -s WASM=1 -s MODULARIZE=1 -s 'EXPORT_NAME="LZ4"' -s SINGLE_FILE=1 -s ALLOW_MEMORY_GROWTH=1 -s EXTRA_EXPORTED_RUNTIME_METHODS='["cwrap"]' -I lz4 wasm-wrapper.c lz4/lz4.c
// YOU MUST MAKE SURE YOU USE THE CORRECT EMCC -- source the emsdk_env.sh script, e.g. "source $HOME/emsdk/emsdk_env.sh"


#include <stdlib.h> // required for malloc definition
#include "emscripten.h"
#include "lz4/lz4.h"

EMSCRIPTEN_KEEPALIVE
char* create_buffer(int bytes) {
  return malloc(bytes);
}

EMSCRIPTEN_KEEPALIVE
void destroy_buffer(char* p) {
  free(p);
}

EMSCRIPTEN_KEEPALIVE
int decompress(char* in, int in_len, char* out, int out_len) {
  return LZ4_decompress_safe_partial(in, out, in_len, out_len, out_len);
}


