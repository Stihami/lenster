import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from '@apollo/client';
import result from '@generated/types';
import axios from 'axios';
import Cookies, { CookieAttributes } from 'js-cookie';
import jwtDecode from 'jwt-decode';

import { API_URL, ERROR_MESSAGE } from '../constants';
import { cursorBasedPagination } from './lib/cursorBasedPagination';
import dataIdFromObject from './lib/dataIdFromObject';

export const COOKIE_CONFIG: CookieAttributes = {
  sameSite: 'None',
  secure: true,
  expires: 360
};

const REFRESH_AUTHENTICATION_MUTATION = `
  mutation Refresh($request: RefreshRequest!) {
    refresh(request: $request) {
      accessToken
      refreshToken
    }
  }
`;

const httpLink = new HttpLink({
  uri: API_URL,
  fetchOptions: 'no-cors',
  fetch
});

const authLink = new ApolloLink((operation, forward) => {
  const accessToken = Cookies.get('accessToken');

  if (accessToken === 'undefined' || !accessToken) {
    Cookies.remove('accessToken');
    Cookies.remove('refreshToken');

    return forward(operation);
  }

  operation.setContext({
    headers: {
      'x-access-token': accessToken ? `Bearer ${accessToken}` : ''
    }
  });

  const { exp }: { exp: number } = jwtDecode(accessToken);

  if (Date.now() >= exp * 1000) {
    axios(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        operationName: 'Refresh',
        query: REFRESH_AUTHENTICATION_MUTATION,
        variables: {
          request: { refreshToken: Cookies.get('refreshToken') }
        }
      })
    })
      .then(({ data }) => {
        const refresh = data?.data?.refresh;
        operation.setContext({
          headers: {
            'x-access-token': accessToken ? `Bearer ${refresh?.accessToken}` : ''
          }
        });
        Cookies.set('accessToken', refresh?.accessToken, COOKIE_CONFIG);
        Cookies.set('refreshToken', refresh?.refreshToken, COOKIE_CONFIG);
      })
      .catch(() => console.log(ERROR_MESSAGE));
  }

  return forward(operation);
});

const cache = new InMemoryCache({
  possibleTypes: result.possibleTypes,
  dataIdFromObject,
  typePolicies: {
    Query: {
      fields: {
        timeline: cursorBasedPagination(['request', ['profileId']]),
        explorePublications: cursorBasedPagination(['request', ['sortCriteria']]),
        publications: cursorBasedPagination(['request', ['profileId', 'commentsOf', 'publicationTypes']]),
        nfts: cursorBasedPagination(['request', ['ownerAddress', 'chainIds']]),
        notifications: cursorBasedPagination(['request', ['profileId']]),
        followers: cursorBasedPagination(['request', ['profileId']]),
        following: cursorBasedPagination(['request', ['address']]),
        search: cursorBasedPagination(['request', ['query', 'type']]),
        whoCollectedPublication: cursorBasedPagination(['request', ['publicationId']])
      }
    }
  }
});

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache
});

export const nodeClient = new ApolloClient({
  link: httpLink,
  cache
});

export default client;