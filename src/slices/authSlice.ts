import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { AuthRole } from '@/types/auth';
import * as authDb from '@/db/auth';

type Status = 'idle' | 'authenticating' | 'error';

export interface AuthState {
    username: string | null;
    role: AuthRole;
    status: Status;
    error: string | null;
    adminDefaultPassword: boolean;
}

const initialState: AuthState = {
    username: 'guest',
    role: AuthRole.Guest,
    status: 'idle',
    error: null,
    adminDefaultPassword: false,
};

// No-op init: state is kept in Redux only, default guest
export const initAuth = createAsyncThunk('auth/init', async () => {
    return { username: 'guest', role: AuthRole.Guest };
});

export const loginWithRole = createAsyncThunk(
    'auth/loginWithRole',
    async (
        args: { role: AuthRole.Admin | AuthRole.User; password: string; username?: string },
        { rejectWithValue }
    ) => {
        let username: string | null = null;
        if (args.role === AuthRole.Admin) {
            username = await authDb.validateAdmin(args.password);
        } else {
            if (!args.username) return rejectWithValue('请输入用户名');
            username = await authDb.validateUser(args.username, args.password);
        }
        if (!username) return rejectWithValue('用户名或密码错误');
        return { username, role: args.role };
    }
);

export const switchToGuest = createAsyncThunk('auth/switchToGuest', async () => {
    return { username: 'guest', role: AuthRole.Guest };
});

export const checkAdminDefaultPassword = createAsyncThunk('auth/checkAdminDefault', async () => {
    return await authDb.isAdminPasswordDefault();
});

export const setAdminPassword = createAsyncThunk(
    'auth/setAdminPassword',
    async (newPassword: string, { rejectWithValue }) => {
        const rows = await authDb.updateAdminPassword(newPassword);
        if (!rows) return rejectWithValue('未更新任何记录');
        return true;
    }
);

const slice = createSlice({
    name: 'auth',
    initialState,
    reducers: {},
    extraReducers: (b) => {
        b.addCase(initAuth.fulfilled, (s, a) => {
            s.username = a.payload.username;
            s.role = a.payload.role;
            s.status = 'idle';
            s.error = null;
        });

        b.addCase(loginWithRole.pending, (s) => {
            s.status = 'authenticating';
            s.error = null;
        });
        b.addCase(loginWithRole.fulfilled, (s, a) => {
            s.username = a.payload.username;
            s.role = a.payload.role;
            s.status = 'idle';
            s.error = null;
        });
        b.addCase(loginWithRole.rejected, (s, a) => {
            s.status = 'error';
            s.error = (a.payload as string) ?? '验证失败';
        });

        b.addCase(switchToGuest.fulfilled, (s, a) => {
            s.username = a.payload.username;
            s.role = a.payload.role;
            s.status = 'idle';
            s.error = null;
        });

        b.addCase(checkAdminDefaultPassword.fulfilled, (s, a) => {
            s.adminDefaultPassword = a.payload as boolean;
        });

        b.addCase(setAdminPassword.fulfilled, (s) => {
            s.adminDefaultPassword = false;
        });
    },
});

export default slice.reducer;
