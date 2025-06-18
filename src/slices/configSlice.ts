import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface ConfigState {
  rootPath: string;
}

const initialState: ConfigState = {
  rootPath: '',
};

const configSlice = createSlice({
  name: 'config',
  initialState,
  reducers: {
    setRootPath: (state, action: PayloadAction<string>) => {
      state.rootPath = action.payload;
    },
  },
});

export const { setRootPath } = configSlice.actions;
export default configSlice.reducer;
