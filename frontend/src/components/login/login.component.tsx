import AuthLayout from "../auth/AuthLayout";
import { useForm, SubmitHandler } from "react-hook-form";
import SSInput from "../ui-component/ss-input/ss-input";
import SSButton from "../ui-component/ss-button/ss-button";
import { useState } from "react";
import { useLoginUserMutation, useGoogleLoginMutation } from "../../redux/apis/auth.api";
import { storeUserInfo } from "../../services/auth.service";
import RedirectComponent from "../redirect.component";
import toast, { Toaster } from "react-hot-toast";
import { GoogleLogin } from "@react-oauth/google";

type Inputs = {
  email: string;
  password: string;
};

const LoginComponent = () => {
  const [loginUser] = useLoginUserMutation();
  const [googleLogin] = useGoogleLoginMutation();
  const { register, handleSubmit } = useForm<Inputs>();
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    setIsBusy(true);
    try {
      const res = await loginUser({ ...data }).unwrap();
      if (res.data.accessToken) {
        toast.success("User logged in successfully!");
        storeUserInfo({ accessToken: res.data.accessToken });
        setIsLoggedIn(true);
      }
    } catch (err: unknown) {
      console.log("error: ", err);
      toast.error("Failed to login. Please check your credentials.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleGoogleLoginSuccess = async (credentialResponse: any) => {
    setIsBusy(true);
    try {
      const res = await googleLogin({ token: credentialResponse.credential }).unwrap();
      if (res.data.accessToken) {
        toast.success("User logged in successfully with Google!");
        storeUserInfo({ accessToken: res.data.accessToken });
        setIsLoggedIn(true);
      }
    } catch (err: unknown) {
      console.log("Google login error: ", err);
      toast.error("Failed to login with Google. Please try again.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleGoogleLoginError = () => {
    console.log("Login Failed");
    toast.error("Google login failed. Please try again.");
  };

  if (isLoggedIn) {
    return <RedirectComponent defaultPath="/" />;
  }

  return (
    <>
      <AuthLayout
  title="Welcome Back"
  subtitle="Login to continue your storytelling journey."
>
  <div className="w-full space-y-6">
    
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-gray-700"></div>
      </div>

      <div className="relative flex justify-center text-sm">
        <span className="px-4 text-gray-400 font-semibold">
          LOGIN WITH EMAIL
        </span>
      </div>
    </div>

    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <SSInput
        label="Email *"
        name="email"
        type="email"
        placeholder="Enter your email"
        required={true}
        icon="fas fa-envelope"
        register={register}
      />

      <SSInput
        label="Password *"
        name="password"
        type="password"
        placeholder="Enter your password"
        required={true}
        icon="fas fa-lock"
        register={register}
      />

      <SSButton text="Sign In" type="submit" isLoading={isBusy} />
    </form>

    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-gray-700"></div>
      </div>

      <div className="relative flex justify-center text-sm">
        <span className="px-4 text-gray-400">OR</span>
      </div>
    </div>

    <div className="w-full flex justify-center">
      <GoogleLogin
        onSuccess={handleGoogleLoginSuccess}
        onError={handleGoogleLoginError}
      />
    </div>

    <div className="text-center text-sm text-indigo-600">
      <div className="space-y-2">
        <a
          href="/signup"
          className="block text-custom hover:underline"
        >
          Create a new account
        </a>
      </div>
    </div>
  </div>
</AuthLayout>
    </>
  );
};

export default LoginComponent;
