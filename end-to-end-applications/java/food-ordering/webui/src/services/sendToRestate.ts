import axios from 'axios';

const RESTATE_HOST =
  process.env.REACT_APP_RESTATE_HOST || 'http://localhost:8080';
const KAFKA_REST_PROXY_HOST = 'http://localhost:8088';

const challenge = (): { challenge: string; challengeTime: string } => {
  const challengeTime = new Date().getTime();
  const challenge = challengeTime ^ 7925119523126;
  return {
    challenge: challenge.toString(),
    challengeTime: challengeTime.toString(),
  };
};

const challengeHeaders = () => {
  const c = challenge();

  return { 'X-Challenge': c.challenge, 'X-Challenge-Time': c.challengeTime };
};

export async function createOrder(orderId: string, order: any) {
  return await (
    await axios.post(
      `${RESTATE_HOST}/OrderWorkflow/${orderId}/create`,
      order,
      {
        headers: {
          'content-type': 'application/json',
          ...challengeHeaders(),
        },
      }
    )
  ).data;
}

export async function getStatus(orderId: string) {
  return await (
    await axios.get(`${RESTATE_HOST}/OrderStatusService/${orderId}/get`, {
      headers: challengeHeaders(),
    })
  ).data;
}

export const publishToKafka = async (record: any) => {
  return await (
    await axios.post(
      `${KAFKA_REST_PROXY_HOST}/topics/orders`,
      `{"records":[${record}]}`,
      {
        headers: {
          'Content-Type': 'application/vnd.kafka.json.v2+json',
          Accept: '*/*',
        },
      }
    )
  ).data;
};
