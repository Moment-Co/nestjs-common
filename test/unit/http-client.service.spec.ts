import axios from 'axios';
import { HttpClientService } from '../../src/http-client/http-client.service';
import { HttpClientException } from '../../src/http-client/http-client.exception';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HttpClientService', () => {
  let service: HttpClientService;

  beforeEach(() => {
    service = new HttpClientService({ retries: 1, timeoutMs: 1000 });
    mockedAxios.create.mockReturnValue(mockedAxios as never);
    mockedAxios.isAxiosError.mockReturnValue(true);
  });

  it('throws HttpClientException with type=client on 404', async () => {
    mockedAxios.request.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 404 },
    });

    await expect(service.get('/test')).rejects.toThrow(HttpClientException);
  });
});
