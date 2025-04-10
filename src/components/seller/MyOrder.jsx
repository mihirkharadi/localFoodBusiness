import { useState, useEffect } from "react";
import Footer from "../../layouts/Footer";
import Navbar from "../../layouts/Navbar";
import { auth, db } from "../../firebaseConfig";
import { toast } from "react-toastify";
import {
  collection,
  addDoc,
  orderBy,
  where,
  query,
  getDocs,
  serverTimestamp,
  updateDoc,
  doc,
  startAfter,
  endBefore,
  limit
} from "firebase/firestore";
import Loading from "../../layouts/Loader";
import { useNavigate } from "react-router-dom";

export default function Orders() {
  const [cartItems, setCartItems] = useState([]);
  const [kitchensData, setKitchensData] = useState(null);
  const [loader, setLoader] = useState(false);
  const [isDispatch, setIsDispatch] = useState(false);
  const [chatId, setChatId] = useState({ chatId: "" });
  const [prevStack, setPrevStack] = useState([]);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  const navigate = useNavigate();
  const userId = auth.currentUser?.uid;

  useEffect(() => {
    if (!userId) return;
    const fetchKitchenData = async () => {
      const snapshot = await getDocs(collection(db, "kitchens"));
      const kitchenData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const userKitchen = kitchenData.find((cur) => cur.id === userId);
      if (userKitchen) {
        setKitchensData(userKitchen.kitchenName);
      }
    };
    fetchKitchenData();
  }, [userId]);

  useEffect(() => {
    if (kitchensData) fetchOrders("init");
  }, [kitchensData]);

  const fetchOrders = async (direction = "init") => {
    if (!userId || !kitchensData) return;
    setLoader(true);
    const pageSize = window.innerWidth < 768 ? 1 : 5;

    let q;
    if (direction === "next" && lastVisible) {
      q = query(
        collection(db, "order"),
        where("paymentStatus", "==", "Done"),
        where("kitchenName", "==", kitchensData),
        where("OrderStatus", "!=", "Delivered"),
        orderBy("createdAt", "desc"),
        startAfter(lastVisible),
        limit(pageSize)
      );
    } else if (direction === "prev" && prevStack.length > 0) {
      const prev = [...prevStack];
      const last = prev.pop();
      setPrevStack(prev);
      q = query(
        collection(db, "order"),
        where("paymentStatus", "==", "Done"),
        where("kitchenName", "==", kitchensData),
        where("OrderStatus", "!=", "Delivered"),
        orderBy("createdAt", "desc"),
        startAfter(last),
        limit(pageSize)
      );
    } else {
      q = query(
        collection(db, "order"),
        where("paymentStatus", "==", "Done"),
        where("kitchenName", "==", kitchensData),
        where("OrderStatus", "!=", "Delivered"),
        orderBy("createdAt", "desc"),
        limit(pageSize)
      );
    }

    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      docId: doc.id,
    }));

    if (direction === "next" && lastVisible) {
      setPrevStack((prev) => [...prev, lastVisible]);
    }

    const newLastVisible = snapshot.docs[snapshot.docs.length - 1];
    setCartItems(docs);
    setLastVisible(newLastVisible);
    setHasMore(snapshot.docs.length === pageSize);
    setLoader(false);
  };

  const handleStatus = async (orderId, newStatus) => {
    try {
      await updateDoc(doc(db, "order", orderId), { OrderStatus: newStatus });
      if (newStatus === "Process") setIsDispatch(true);
      fetchOrders("init");
    } catch (error) {
      console.error("Error updating order status: ", error);
    }
  };

  const handleChat = async (kitchenId, buyerId, buyerName) => {
    const chatRef = collection(db, "chats");
    const q = query(chatRef, where("users", "array-contains", buyerId));
    const existingChats = await getDocs(q);

    let finalChatId = null;

    existingChats.forEach((doc) => {
      const data = doc.data();
      if (data.users.includes(kitchenId)) {
        finalChatId = doc.id;
      }
    });

    if (!finalChatId) {
      const newChat = await addDoc(chatRef, {
        users: [buyerId, kitchenId],
        lastMessage: "",
        lastMessageTimeStamp: null,
      });
      finalChatId = newChat.id;
    }

    setChatId({ chatId: finalChatId });
    toast.success("Chat with your customer", {
      position: "top-right",
      autoClose: 1000,
      hideProgressBar: true,
      style: {
        width: "150px",
        padding: "10px",
        fontSize: "14px",
        minHeight: "40px",
        backgroundColor: "black",
        color: "white",
      },
    });

    navigate(`/chat/${kitchenId}/${buyerId}/${finalChatId}/${buyerName}/${kitchensData}`);
  };

  return (
    <div className="min-h-screen bg-[#FFA500] text-white">
      <Navbar />
      <div className="mt-3">
        <h2 className="text-2xl font-bold text-center">My Orders</h2>
        <p className="text-center">Track your recent orders</p>

        {loader ? (
          <Loading />
        ) : (
          <>
            <div className="flex gap-3 mx-3 flex-wrap justify-evenly items-center overflow-y-auto max-h-[70vh]">
              {cartItems.map((order) => (
                <div
                  key={order.orderRefId}
                  className="max-w-3xs mt-2 bg-white rounded-xl shadow-lg border border-gray-200 p-4"
                >
                  <div className="flex justify-center items-center border-b pb-2">
                    <h3 className="text-sm font-bold text-gray-900">{order.orderRefId}</h3>
                    <span
                      className={`text-sm font-medium px-3 py-1 rounded-lg ml-2 ${
                        order.OrderStatus === "Pending"
                          ? "bg-yellow-200 text-yellow-800"
                          : order.OrderStatus === "Process"
                          ? "bg-green-200 text-green-800"
                          : order.OrderStatus === "Rejected"
                          ? "bg-red-200 text-red-800"
                          : "bg-blue-200 text-blue-800"
                      }`}
                    >
                      {order.OrderStatus}
                    </span>
                  </div>

                  <div className="mt-2">
                    <p className="text-gray-700 font-semibold">Name: {order.CustomerDetails.username}</p>
                    <p className="text-gray-500 text-sm">
                      📍Address: {order.CustomerDetails.address}, {order.CustomerDetails.pinCode}
                    </p>
                  </div>

                  {order.ItemsDetails.map((item, index) => (
                    <div key={index} className="mt-3 space-y-2">
                      <div className="flex justify-between text-gray-800">
                        <span>
                          {item.itemName} x{item.quantity}
                        </span>
                        <span>₹{item.price * item.quantity}</span>
                      </div>
                    </div>
                  ))}

                  <div className="border-t mt-3 pt-2 flex justify-between items-center">
                    <span className="font-semibold text-black text-sm">
                      Total: ₹{order.ItemsDetails[0].total}
                    </span>
                    <span className="font-semibold text-black text-sm">
                      Payment: {order.paymentMethod}
                    </span>
                  </div>

                  <button
                    onClick={() => handleChat(order.kitchenId, order.id, order.CustomerDetails.username)}
                    className="w-full mt-2 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
                  >
                    💬 Chat with Customer
                  </button>

                  {(isDispatch || order.OrderStatus === "Dispatch") ? (
                    <div className="mt-2 flex gap-2">
                      {order.OrderStatus === "Dispatch" ? (
                        <button
                          onClick={() => handleStatus(order.docId, "Delivered")}
                          className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-bold"
                        >
                          Mark as Delivered
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStatus(order.docId, "Dispatch")}
                          className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition font-bold"
                        >
                          Dispatch Now
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => handleStatus(order.docId, "Process")}
                        className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition font-semibold"
                      >
                        Accept Order
                      </button>
                      <button
                        onClick={() => handleStatus(order.docId, "Rejected")}
                        className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition font-semibold"
                      >
                        Reject Order
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-center gap-4 mt-4">
              <button
                onClick={() => fetchOrders("prev")}
                disabled={prevStack.length === 0}
                className="bg-white text-black py-1 px-3 rounded disabled:opacity-50"
              >
                ← Prev
              </button>
              <button
                onClick={() => fetchOrders("next")}
                disabled={!hasMore}
                className="bg-white text-black py-1 px-3 rounded disabled:opacity-50"
              >
                Next →
              </button>
            </div>
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}
