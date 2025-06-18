import { configureStore } from '@reduxjs/toolkit'
import configReducer from './slices/configSlice';

const store = configureStore({
  reducer: {
    config: configReducer,
  },
})

export default store;

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch