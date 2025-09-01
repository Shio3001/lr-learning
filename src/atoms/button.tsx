type ButtonProps = {
  handler?: () => void;
};

const Button = (props: ButtonProps) => {
  return (
    <button
      onClick={(e) => {
        props.handler?.();
      }}
      className="my-button"
    >
      Click Me
    </button>
  );
};

export default Button;
