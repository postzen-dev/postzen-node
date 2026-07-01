export * from './accountsApi';
import { AccountsApi } from './accountsApi';
export * from './connectApi';
import { ConnectApi } from './connectApi';
export * from './mediaApi';
import { MediaApi } from './mediaApi';
export * from './postsApi';
import { PostsApi } from './postsApi';
export * from './profilesApi';
import { ProfilesApi } from './profilesApi';
import * as http from 'http';

export class HttpError extends Error {
    constructor (public response: http.IncomingMessage, public body: any, public statusCode?: number) {
        super('HTTP request failed');
        this.name = 'HttpError';
    }
}

export { RequestFile } from '../model/models';

export const APIS = [AccountsApi, ConnectApi, MediaApi, PostsApi, ProfilesApi];
