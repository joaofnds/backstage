/*
 * Copyright 2022 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { useQuery } from 'react-query';

import { errorApiRef, useApi } from '@backstage/core-plugin-api';

import { gcalendarApiRef } from '../api';

type Options = {
  enabled: boolean;
  refreshTime?: number;
};

export const useCalendarsQuery = ({ enabled }: Options) => {
  const calendarApi = useApi(gcalendarApiRef);
  const errorApi = useApi(errorApiRef);

  return useQuery(
    ['calendars'],
    async () =>
      calendarApi.getCalendars({
        minAccessRole: 'reader',
      }),
    {
      enabled,
      keepPreviousData: true,
      refetchInterval: 3600000,
      onError: () => {
        errorApi.post({
          name: 'API error',
          message: 'Failed to fetch calendars.',
        });
      },
    },
  );
};
