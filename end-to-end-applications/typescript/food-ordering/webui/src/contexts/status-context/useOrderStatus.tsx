import { useCallback } from 'react';
import { useOrderStatusContext } from './OrderStatusProvider';
import { sendRequestToRestate } from '../../services/sendToRestate';
import { useUserContext } from '../user-context/UserContextProvider';

const useOrderStatus = () => {
  const { orderStatus, setOrderStatus } = useOrderStatusContext();
  const { user } = useUserContext();

  const fetchOrderStatus = useCallback(() => {
    if (user) {
      console.debug(`Found user ${user}`);
      sendRequestToRestate({
        service: 'order-status',
        method: 'get',
        key: user!.shopping_cart_id,
        data: {},
      }).then((response) => {
        setOrderStatus(response.response);
      });
    } else {
      console.debug("Didn't find user");
      setOrderStatus({ eta: 0, status: 'NEW' });
    }
  }, []);

  return {
    orderStatus,
    fetchOrderStatus,
    setOrderStatus,
  };
};

export default useOrderStatus;
